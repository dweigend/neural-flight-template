import * as THREE from "three";
import { BERLIN_TILE_RUNTIME } from "../constants";
import type { GeoReference, LocalCoordinate } from "../geo";
import { BERLIN_MITTE_GEO_REFERENCE, getBerlinMitteEcef } from "../geo";
import {
  loadTilesRendererConstructor,
  type TilesRendererLike,
} from "./tiles-renderer-module";
import { resolveCesiumIonSourceUrl } from "./tiles-source";

export type TilesRuntimeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "disposed";

export interface TilesRuntimeSource {
  url?: string;
  assetId?: string;
  accessToken?: string;
  attribution?: string;
}

export interface TilesRuntimeStats {
  status: TilesRuntimeStatus;
  loadedTileCount: number;
  visibleTileCount: number;
  lastErrorMessage: string | null;
}

export interface TilesRuntimeFrameContext {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  deltaSeconds: number;
  originOffsetMeters: LocalCoordinate;
}

export interface TilesRuntimeAdapter {
  readonly id: string;
  readonly root: THREE.Group;
  readonly geoReference: GeoReference;
  readonly stats: TilesRuntimeStats;
  load(source: TilesRuntimeSource): Promise<void>;
  update(ctx: TilesRuntimeFrameContext): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

function createInitialStats(): TilesRuntimeStats {
  return {
    status: "idle",
    loadedTileCount: 0,
    visibleTileCount: 0,
    lastErrorMessage: null,
  };
}

export function createTilesRuntimeAdapter(
  geoReference: GeoReference = BERLIN_MITTE_GEO_REFERENCE,
): TilesRuntimeAdapter {
  return new ThreeTilesRuntimeAdapter(geoReference);
}

class ThreeTilesRuntimeAdapter implements TilesRuntimeAdapter {
  readonly id = BERLIN_TILE_RUNTIME.id;
  readonly root = new THREE.Group();
  readonly geoReference: GeoReference;
  readonly stats = createInitialStats();
  #abortController: AbortController | null = null;
  #isDisposed = false;
  #tiles: TilesRendererLike | null = null;

  constructor(geoReference: GeoReference) {
    this.geoReference = geoReference;
    this.root.name = "berlin-tiles-runtime-root";
    this.root.visible = false;
  }

  async load(source: TilesRuntimeSource): Promise<void> {
    console.log("[TilesRuntimeAdapter] load called", source);
    if (this.#isDisposed) return;
    if (!source.url && !source.assetId) {
      this.setError("Tiles source URL or Cesium ion asset ID is required.");
      return;
    }

    this.stats.status = "loading";
    this.stats.lastErrorMessage = null;
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      await this.loadTiles(source, this.#abortController.signal);
      if (this.stats.status !== "error") {
        console.log("[TilesRuntimeAdapter] loadTiles completed successfully");
      }
    } catch (error) {
      console.error("[TilesRuntimeAdapter] loadTiles error", error);
      if (this.#isDisposed) return;
      if (isAbortError(error)) return;
      this.setError(readErrorMessage(error));
    }
  }

  update(ctx: TilesRuntimeFrameContext): void {
    if (this.#isDisposed) return;
    if (!this.root.visible) return;
    if (this.stats.status !== "ready") return;
    if (!this.#tiles) return;
    if (!Number.isFinite(ctx.deltaSeconds)) return;

    this.#tiles.setCamera(ctx.camera);
    this.#tiles.setResolutionFromRenderer(ctx.camera, ctx.renderer);
    this.#tiles.update();
  }

  setVisible(visible: boolean): void {
    if (this.#isDisposed) return;
    this.root.visible = visible;
  }

  dispose(): void {
    if (this.#isDisposed) return;

    this.#isDisposed = true;
    this.#abortController?.abort();
    this.#abortController = null;
    this.disposeTilesOnly();
    this.stats.status = "disposed";
    this.stats.loadedTileCount = 0;
    this.stats.visibleTileCount = 0;
    this.root.clear();
    this.root.removeFromParent();
  }

  private async loadTiles(
    source: TilesRuntimeSource,
    signal: AbortSignal,
  ): Promise<void> {
    console.log("[TilesRuntimeAdapter] resolving URL...");
    const tilesetUrl = await resolveCesiumIonSourceUrl(source, signal);
    console.log("[TilesRuntimeAdapter] resolved URL:", tilesetUrl);
    if (this.#isDisposed) return;
    if (!tilesetUrl) {
      this.setError("Unable to resolve Cesium ion tileset URL.");
      return;
    }

    console.log("[TilesRuntimeAdapter] loading renderer constructor...");
    const TilesRenderer = await loadTilesRendererConstructor();
    console.log(
      "[TilesRuntimeAdapter] renderer constructor loaded:",
      !!TilesRenderer,
    );
    if (this.#isDisposed) return;
    if (!TilesRenderer) {
      this.setError("3d-tiles-renderer package is not available.");
      return;
    }

    this.disposeTilesOnly();
    this.#tiles = new TilesRenderer(tilesetUrl);

    // Use the library's built-in Cesium Ion support if available
    // Most versions of 3d-tiles-renderer support a 'preprocessURL' or similar
    // but the most robust way is to use their specialized Ion loader if it exists.
    // For now, we stick to the fetchOptions approach but refine it.

    if (source.accessToken && !tilesetUrl.includes("googleapis.com")) {
      // If it's a Cesium Ion asset, we should use the token for all sub-requests
      // but NOT for Google tiles as it causes a 401.
      this.#tiles.fetchOptions = {
        ...this.#tiles.fetchOptions,
        headers: {
          ...this.#tiles.fetchOptions?.headers,
          Authorization: `Bearer ${source.accessToken}`,
        },
      };
      console.log("[TilesRuntimeAdapter] Applied Bearer token to fetchOptions");
    }
    console.log("[TilesRuntimeAdapter] TilesRenderer instance created");

    // Apply ECEF to Local transform
    this.applyGeoreference(this.#tiles);

    this.root.add(this.#tiles.group);
    this.setVisible(true);
    this.stats.status = "ready";
    console.log("[TilesRuntimeAdapter] status set to ready");
  }

  private applyGeoreference(tiles: TilesRendererLike): void {
    const originEcef = getBerlinMitteEcef();
    const pos = new THREE.Vector3(originEcef.x, originEcef.y, originEcef.z);

    // Up vector is the normalized ECEF position (for WGS84 it's close enough)
    const up = pos.clone().normalize();

    // East vector: [-sin(lon), cos(lon), 0]
    const lonRad = (this.geoReference.origin.longitudeDegrees * Math.PI) / 180;
    const east = new THREE.Vector3(-Math.sin(lonRad), Math.cos(lonRad), 0);

    // North vector: Up x East
    const north = new THREE.Vector3().crossVectors(up, east);

    // South vector: -North (since our Z is South)
    const south = north.clone().multiplyScalar(-1);

    // Create the rotation matrix from ECEF to Local
    // Columns are East, Up, South
    const matrix = new THREE.Matrix4();
    matrix.set(
      east.x,
      up.x,
      south.x,
      0,
      east.y,
      up.y,
      south.y,
      0,
      east.z,
      up.z,
      south.z,
      0,
      0,
      0,
      0,
      1,
    );

    // We want the inverse: Local = Matrix^T * (ECEF - Origin)
    const inverseRotation = matrix.clone().transpose();

    // Apply translation then rotation
    // tiles.group.matrix = inverseRotation * Translation(-pos)
    const translation = new THREE.Matrix4().makeTranslation(
      -pos.x,
      -pos.y,
      -pos.z,
    );
    const finalMatrix = new THREE.Matrix4().multiplyMatrices(
      inverseRotation,
      translation,
    );

    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(finalMatrix);
    tiles.group.updateMatrixWorld(true);
  }

  private disposeTilesOnly(): void {
    if (!this.#tiles) return;

    this.#tiles.group.removeFromParent();
    this.#tiles.dispose();
    this.#tiles = null;
  }

  private setError(message: string): void {
    this.disposeTilesOnly();
    this.stats.status = "error";
    this.stats.loadedTileCount = 0;
    this.stats.visibleTileCount = 0;
    this.stats.lastErrorMessage = message;
    this.setVisible(false);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown tiles runtime load error.";
}
