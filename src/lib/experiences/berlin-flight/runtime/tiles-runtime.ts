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

type CesiumIonEndpointResponse = {
  accessToken?: unknown;
  options?: {
    url?: unknown;
  };
  url?: unknown;
};

const BERLIN_TILE_RUNTIME_TUNING = {
  errorTarget: 20,
  loadSiblings: false,
  loadAncestors: true,
  maxTilesProcessed: 96,
  downloadJobs: 8,
  parseJobs: 2,
  processNodeJobs: 8,
  minCacheItems: 128,
  maxCacheItems: 256,
  minCacheBytes: 64 * 1024 * 1024,
  maxCacheBytes: 128 * 1024 * 1024,
  unloadPercent: 0.2,
} as const;

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
    this.assertCanLoad(signal);
    const activeLoad = this.renderer ?? this.loadPromise;
    if (activeLoad) {
      return activeLoad;
    }

    this.loadPromise = this.initializeTiles(group, signal);
    return this.loadPromise;
  }

  private async initializeTiles(
    group: Group,
    signal?: AbortSignal,
  ): Promise<TilesRenderer> {
    this.assertHasTilesUrl();

    let renderer: TilesRenderer | null = null;

    try {
      console.log(
        "[BerlinFlight] Initializing TilesRenderer with URL:",
        this.url,
      );

      renderer = new TilesRenderer(this.url);
      this.configureRenderer(renderer);
      this.disposeRendererIfCancelled(renderer, signal);

      this.renderer = renderer;
      group.add(renderer.group);

      console.log("[BerlinFlight] 3D Tiles renderer initialized.");
      return renderer;
    } catch (error) {
      this.cleanupFailedRenderer(renderer);

      console.error(
        "[BerlinFlight] Failed to initialize 3D Tiles renderer:",
        error,
      );
      throw error;
    }
  }

  private assertCanLoad(signal?: AbortSignal): void {
    if (this.disposed) {
      throw new Error("[BerlinFlight] Cannot load tiles after disposal.");
    }

    if (isSignalAborted(signal)) {
      throw new Error("[BerlinFlight] Tile loading was cancelled.");
    }
  }

  private assertHasTilesUrl(): void {
    if (!this.url) {
      throw new Error("[BerlinFlight] Cannot load tiles: URL is null or empty");
    }
  }

  private disposeRendererIfCancelled(
    renderer: TilesRenderer,
    signal?: AbortSignal,
  ): void {
    if (this.disposed || isSignalAborted(signal)) {
      renderer.dispose();
      throw new Error("[BerlinFlight] Tile loading was cancelled.");
    }
  }

  private configureRenderer(renderer: TilesRenderer): void {
    const isGoogleTiles = this.registerGoogleTilesPlugin(renderer);

    if (this.token && !isGoogleTiles) {
      renderer.fetchOptions.headers = {
        Authorization: `Bearer ${this.token}`,
      };
    }

    renderer.errorTarget = BERLIN_TILE_RUNTIME_TUNING.errorTarget;
    renderer.loadSiblings = BERLIN_TILE_RUNTIME_TUNING.loadSiblings;
    renderer.loadAncestors = BERLIN_TILE_RUNTIME_TUNING.loadAncestors;
    renderer.maxTilesProcessed = BERLIN_TILE_RUNTIME_TUNING.maxTilesProcessed;
    renderer.downloadQueue.maxJobs = BERLIN_TILE_RUNTIME_TUNING.downloadJobs;
    renderer.parseQueue.maxJobs = BERLIN_TILE_RUNTIME_TUNING.parseJobs;
    renderer.processNodeQueue.maxJobs =
      BERLIN_TILE_RUNTIME_TUNING.processNodeJobs;
    renderer.lruCache.minSize = BERLIN_TILE_RUNTIME_TUNING.minCacheItems;
    renderer.lruCache.maxSize = BERLIN_TILE_RUNTIME_TUNING.maxCacheItems;
    renderer.lruCache.minBytesSize =
      BERLIN_TILE_RUNTIME_TUNING.minCacheBytes;
    renderer.lruCache.maxBytesSize =
      BERLIN_TILE_RUNTIME_TUNING.maxCacheBytes;
    renderer.lruCache.unloadPercent = BERLIN_TILE_RUNTIME_TUNING.unloadPercent;
    renderer.addEventListener("load-model", this.handleLoadModel);
    renderer.addEventListener("dispose-model", this.handleDisposeModel);
  }

  private cleanupFailedRenderer(renderer: TilesRenderer | null): void {
    if (renderer) {
      renderer.removeEventListener("load-model", this.handleLoadModel);
      renderer.removeEventListener("dispose-model", this.handleDisposeModel);
      renderer.dispose();
    }

    this.meshRegistry.dispose();
    this.renderer = null;
    this.loadPromise = null;
  }

  private registerGoogleTilesPlugin(renderer: TilesRenderer): boolean {
    if (!this.url.includes("tile.googleapis.com")) {
      return false;
    }

    const apiKey = new URL(this.url).searchParams.get("key");
    if (apiKey) {
      renderer.registerPlugin(
        new GoogleCloudAuthPlugin({
          apiToken: apiKey,
          autoRefreshToken: true,
        }),
      );
    }

    return true;
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
  // fallow-ignore-next-line unused-class-member
  public update(
    cameras: readonly Camera[],
    webglRenderer: WebGLRenderer,
  ): void {
    const renderer = this.getVisibleRenderer();
    if (!renderer) return;

    renderer.group.updateMatrixWorld(true);
    this.syncCameras(renderer, cameras, webglRenderer);
    renderer.update();
  }

  private syncCameras(
    renderer: TilesRenderer,
    cameras: readonly Camera[],
    webglRenderer: WebGLRenderer,
  ): void {
    for (const camera of this.activeCameras) {
      if (!cameras.includes(camera)) {
        renderer.deleteCamera(camera);
        this.activeCameras.delete(camera);
      }
    }

    for (const camera of cameras) {
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      renderer.setResolutionFromRenderer(camera, webglRenderer);
      this.activeCameras.add(camera);
    }
  }

  // fallow-ignore-next-line unused-class-member
  public setVisible(visible: boolean): void {
    if (this.disposed) return;
    if (!this.renderer) return;

    this.renderer.group.visible = visible;
  }

  // fallow-ignore-next-line unused-class-member
  public writeDebugStats(target: TilesRuntimeDebugStats): void {
    const renderer = this.renderer;

    target.hasRenderer = Boolean(renderer);
    target.isDisposed = this.disposed;
    target.trackedMeshes = this.meshRegistry.getTrackedMeshCount();

    if (!renderer) {
      target.isVisible = false;
      target.loadProgress = 0;
      target.visibleTiles = 0;
      target.activeTiles = 0;
      return;
    }

    target.isVisible = renderer.group.visible;
    target.loadProgress = renderer.loadProgress;
    target.visibleTiles = renderer.visibleTiles.size;
    target.activeTiles = renderer.activeTiles.size;
  }

  private getVisibleRenderer(): TilesRenderer | null {
    if (this.disposed) return null;
    if (!this.renderer) return null;
    if (!this.renderer.group.visible) return null;

    return this.renderer;
  }

  // fallow-ignore-next-line unused-class-member
  public getTrackedTileMeshes(): readonly TrackedTileMesh[] {
    return this.meshRegistry.getTrackedTileMeshes();
  }

  // fallow-ignore-next-line unused-class-member
  public getTrackedTileMeshVersion(): number {
    return this.meshRegistry.getVersion();
  }

  /**
   * Cleans up resources.
   */
  // fallow-ignore-next-line unused-class-member
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

function isSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
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

  return resolveCesiumIonTileset();
}

async function resolveCesiumIonTileset(): Promise<{
  url: string;
  token: string;
}> {
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

  const data = (await response.json()) as CesiumIonEndpointResponse;

  return {
    url: getCesiumTilesetUrl(data),
    token: getStringValue(data.accessToken),
  };
}

function getCesiumTilesetUrl(data: CesiumIonEndpointResponse): string {
  const tilesetUrl =
    getStringValue(data.url) || getStringValue(data.options?.url);
  if (tilesetUrl) return tilesetUrl;

  throw new Error(
    `[BerlinFlight] Cesium Ion response missing tileset URL. Response: ${JSON.stringify(data)}`,
  );
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
