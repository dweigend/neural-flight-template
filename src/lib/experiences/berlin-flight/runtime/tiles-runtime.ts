import * as THREE from "three";
import { BERLIN_TILE_RUNTIME } from "../constants";
import type { GeoReference, LocalCoordinate } from "../geo";
import { BERLIN_MITTE_GEO_REFERENCE } from "../geo";
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
    } catch (error) {
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
    const tilesetUrl = await resolveCesiumIonSourceUrl(source, signal);
    if (this.#isDisposed) return;
    if (!tilesetUrl) {
      this.setError("Unable to resolve Cesium ion tileset URL.");
      return;
    }

    const TilesRenderer = await loadTilesRendererConstructor();
    if (this.#isDisposed) return;
    if (!TilesRenderer) {
      this.setError("3d-tiles-renderer package is not available.");
      return;
    }

    this.disposeTilesOnly();
    this.#tiles = new TilesRenderer(tilesetUrl);
    this.root.add(this.#tiles.group);
    this.setVisible(true);
    this.stats.status = "ready";
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
