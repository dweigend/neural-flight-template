import {
  PUBLIC_BERLIN_ION_ASSET_ID,
  PUBLIC_BERLIN_TILES_URL,
  PUBLIC_CESIUM_ION_TOKEN,
} from "$env/static/public";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import type { Camera, Group, WebGLRenderer } from "three";
import { BerlinTileMeshRegistry } from "../collision/mesh-tracker";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { BERLIN_MITTE_ORIGIN } from "../geo/berlin-mitte-origin";
import { getECEFToLocalMatrix } from "../geo/coordinates";

export interface TilesRuntimeDebugStats {
  hasRenderer: boolean;
  isDisposed: boolean;
  isVisible: boolean;
  loadProgress: number;
  visibleTiles: number;
  activeTiles: number;
  trackedMeshes: number;
}

type TileLoadEvent = {
  scene: THREE.Object3D;
  tile: unknown;
  type: "load-model";
  url: string;
};

type TileDisposeEvent = {
  scene: THREE.Object3D;
  tile: unknown;
  type: "dispose-model";
};

/**
 * Adapter for the 3D Tiles runtime.
 * This isolates the specific loader (3d-tiles-renderer) from the experience logic.
 */
export class TilesRuntimeAdapter {
  private renderer: TilesRenderer | null = null;
  private loadPromise: Promise<TilesRenderer> | null = null;
  private readonly activeCameras = new Set<Camera>();
  private readonly meshRegistry = new BerlinTileMeshRegistry();
  private readonly url: string;
  private readonly token: string;
  private disposed = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  public static isSourceConfigured(): boolean {
    return Boolean(
      PUBLIC_BERLIN_TILES_URL ||
        (PUBLIC_CESIUM_ION_TOKEN && Number(PUBLIC_BERLIN_ION_ASSET_ID)),
    );
  }

  public static async create(
    group: Group,
    signal?: AbortSignal,
  ): Promise<TilesRuntimeAdapter> {
    const { url, token } = await resolveBerlinTileset();
    const runtime = new TilesRuntimeAdapter(url, token);
    const renderer = await runtime.loadTiles(group, signal);
    const localMatrix = getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN);
    renderer.group.matrixAutoUpdate = false;
    renderer.group.matrix.copy(localMatrix);
    renderer.group.updateMatrixWorld(true);
    return runtime;
  }

  /**
   * Initializes and loads the tileset.
   */
  public async loadTiles(
    group: Group,
    signal?: AbortSignal,
  ): Promise<TilesRenderer> {
    if (this.disposed) {
      throw new Error("[BerlinFlight] Cannot load tiles after disposal.");
    }

    if (signal?.aborted) {
      throw new Error("[BerlinFlight] Tile loading was cancelled.");
    }

    if (this.renderer) {
      return this.renderer;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.initializeTiles(group, signal);
    return this.loadPromise;
  }

  private async initializeTiles(
    group: Group,
    signal?: AbortSignal,
  ): Promise<TilesRenderer> {
    if (!this.url) {
      throw new Error("[BerlinFlight] Cannot load tiles: URL is null or empty");
    }

    let renderer: TilesRenderer | null = null;

    try {
      console.log(
        "[BerlinFlight] Initializing TilesRenderer with URL:",
        this.url,
      );

      renderer = new TilesRenderer(this.url);
      this.configureRenderer(renderer);

      if (this.disposed || signal?.aborted) {
        renderer.dispose();
        throw new Error("[BerlinFlight] Tile loading was cancelled.");
      }

      this.renderer = renderer;
      group.add(renderer.group);

      console.log("[BerlinFlight] 3D Tiles renderer initialized.");
      return renderer;
    } catch (error) {
      renderer?.removeEventListener("load-model", this.handleLoadModel);
      renderer?.removeEventListener("dispose-model", this.handleDisposeModel);
      this.meshRegistry.dispose();
      renderer?.dispose();
      this.renderer = null;
      this.loadPromise = null;

      console.error(
        "[BerlinFlight] Failed to initialize 3D Tiles renderer:",
        error,
      );
      throw error;
    }
  }

  private configureRenderer(renderer: TilesRenderer): void {
    const isGoogleTiles = this.url.includes("tile.googleapis.com");

    if (isGoogleTiles) {
      const parsedUrl = new URL(this.url);
      const apiKey = parsedUrl.searchParams.get("key");

      if (apiKey) {
        renderer.registerPlugin(
          new GoogleCloudAuthPlugin({
            apiToken: apiKey,
            autoRefreshToken: true,
          }),
        );
      }
    }

    if (this.token && !isGoogleTiles) {
      renderer.fetchOptions.headers = {
        Authorization: `Bearer ${this.token}`,
      };
    }

    renderer.errorTarget = 12;
    renderer.addEventListener("load-model", this.handleLoadModel);
    renderer.addEventListener("dispose-model", this.handleDisposeModel);
  }

  private readonly handleLoadModel = (event: TileLoadEvent): void => {
    this.meshRegistry.trackTileScene(event.scene, event.url);
  };

  private readonly handleDisposeModel = (event: TileDisposeEvent): void => {
    this.meshRegistry.untrackTileScene(event.scene);
  };

  /**
   * Updates the tileset every frame.
   */
  public update(
    cameras: readonly Camera[],
    webglRenderer: WebGLRenderer,
  ): void {
    if (this.disposed) return;
    if (!this.renderer) return;
    if (!this.renderer.group.visible) return;

    this.renderer.group.updateMatrixWorld(true);

    for (const camera of this.activeCameras) {
      if (!cameras.includes(camera)) {
        this.renderer.deleteCamera(camera);
        this.activeCameras.delete(camera);
      }
    }

    for (const camera of cameras) {
      camera.updateMatrixWorld(true);
      this.renderer.setCamera(camera);
      this.renderer.setResolutionFromRenderer(camera, webglRenderer);
      this.activeCameras.add(camera);
    }

    this.renderer.update();
  }

  public setVisible(visible: boolean): void {
    if (this.disposed) return;
    if (!this.renderer) return;

    this.renderer.group.visible = visible;
  }

  public writeDebugStats(target: TilesRuntimeDebugStats): void {
    target.hasRenderer = Boolean(this.renderer);
    target.isDisposed = this.disposed;
    target.isVisible = this.renderer?.group.visible ?? false;
    target.loadProgress = this.renderer?.loadProgress ?? 0;
    target.visibleTiles = this.renderer?.visibleTiles.size ?? 0;
    target.activeTiles = this.renderer?.activeTiles.size ?? 0;
    target.trackedMeshes = this.meshRegistry.getTrackedMeshCount();
  }

  public getTrackedTileMeshes(): readonly TrackedTileMesh[] {
    return this.meshRegistry.getTrackedTileMeshes();
  }

  public getTrackedTileMeshVersion(): number {
    return this.meshRegistry.getVersion();
  }

  /**
   * Cleans up resources.
   */
  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (!this.renderer) {
      this.meshRegistry.dispose();
      this.loadPromise = null;
      this.activeCameras.clear();
      return;
    }

    this.renderer.group.removeFromParent();
    this.renderer.removeEventListener("load-model", this.handleLoadModel);
    this.renderer.removeEventListener("dispose-model", this.handleDisposeModel);
    this.meshRegistry.dispose();
    this.renderer.dispose();
    this.renderer = null;
    this.loadPromise = null;
    this.activeCameras.clear();
  }
}

async function resolveBerlinTileset(): Promise<{
  url: string;
  token: string;
}> {
  if (PUBLIC_BERLIN_TILES_URL) {
    return {
      url: PUBLIC_BERLIN_TILES_URL,
      token: PUBLIC_CESIUM_ION_TOKEN || "",
    };
  }

  const assetId = Number(PUBLIC_BERLIN_ION_ASSET_ID);
  if (!PUBLIC_CESIUM_ION_TOKEN || !assetId) {
    throw new Error(
      "[BerlinFlight] Missing Cesium Ion credentials in public env.",
    );
  }

  const endpoint = `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${PUBLIC_CESIUM_ION_TOKEN}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `[BerlinFlight] Failed to resolve Cesium Ion asset: ${response.status} ${await response.text()}`,
    );
  }

  const data = await response.json();
  const tilesetUrl = data.url || data.options?.url;

  if (!tilesetUrl) {
    throw new Error(
      `[BerlinFlight] Cesium Ion response missing tileset URL. Response: ${JSON.stringify(data)}`,
    );
  }

  return {
    url: tilesetUrl,
    token: data.accessToken || "",
  };
}
