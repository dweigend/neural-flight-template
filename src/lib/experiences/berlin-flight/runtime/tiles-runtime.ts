import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import type { Camera, Group, WebGLRenderer } from "three";
import { BerlinTileMeshRegistry } from "../collision/mesh-tracker";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { BERLIN_MITTE_ORIGIN } from "../geo/berlin-mitte-origin";
import { getECEFToLocalMatrix } from "../geo/coordinates";
import type { BerlinTilesSource } from "./tiles-source";

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

const BERLIN_TILE_RUNTIME_TUNING = {
  errorTarget: 20,
  loadSiblings: false,
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
  private activeCamera: Camera | null = null;
  private readonly meshRegistry = new BerlinTileMeshRegistry();
  private readonly url: string;
  private readonly token: string;
  private disposed = false;

  private constructor(source: BerlinTilesSource) {
    this.url = source.url;
    this.token = source.token;
  }

  public static async create(
    group: Group,
    source: BerlinTilesSource,
    signal?: AbortSignal,
  ): Promise<TilesRuntimeAdapter> {
    const runtime = new TilesRuntimeAdapter(source);
    const renderer = await runtime.initializeTiles(group, signal);
    const localMatrix = getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN);
    renderer.group.matrixAutoUpdate = false;
    renderer.group.matrix.copy(localMatrix);
    renderer.group.updateMatrixWorld(true);
    return runtime;
  }

  private async initializeTiles(
    group: Group,
    signal?: AbortSignal,
  ): Promise<TilesRenderer> {
    this.assertCanLoad(signal);

    let renderer: TilesRenderer | null = null;

    try {
      console.log(
        "[BerlinFlight] Initializing TilesRenderer with URL:",
        this.url,
      );

      renderer = new TilesRenderer(this.url);
      this.configureRenderer(renderer);

      this.renderer = renderer;
      group.add(renderer.group);

      console.log("[BerlinFlight] 3D Tiles renderer initialized.");
      return renderer;
    } catch (error) {
      if (renderer) {
        renderer.removeEventListener("load-model", this.handleLoadModel);
        renderer.removeEventListener("dispose-model", this.handleDisposeModel);
        renderer.dispose();
      }

      this.meshRegistry.dispose();
      this.activeCamera = null;
      this.renderer = null;

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

  private configureRenderer(renderer: TilesRenderer): void {
    const isGoogleTiles = this.registerGoogleTilesPlugin(renderer);

    if (this.token && !isGoogleTiles) {
      renderer.fetchOptions.headers = {
        Authorization: `Bearer ${this.token}`,
      };
    }

    renderer.errorTarget = BERLIN_TILE_RUNTIME_TUNING.errorTarget;
    renderer.loadSiblings = BERLIN_TILE_RUNTIME_TUNING.loadSiblings;
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
  public update(camera: Camera, webglRenderer: WebGLRenderer): void {
    const renderer = this.getVisibleRenderer();
    if (!renderer) return;

    renderer.group.updateMatrixWorld(true);
    this.syncCamera(renderer, camera, webglRenderer);
    renderer.update();
  }

  private syncCamera(
    renderer: TilesRenderer,
    camera: Camera,
    webglRenderer: WebGLRenderer,
  ): void {
    if (this.activeCamera && this.activeCamera !== camera) {
      renderer.deleteCamera(this.activeCamera);
    }

    camera.updateMatrixWorld(true);
    renderer.setCamera(camera);
    renderer.setResolutionFromRenderer(camera, webglRenderer);
    this.activeCamera = camera;
  }

  // fallow-ignore-next-line unused-class-member
  public getDebugStats(): TilesRuntimeDebugStats {
    const renderer = this.renderer;

    if (!renderer) {
      return {
        hasRenderer: false,
        isDisposed: this.disposed,
        isVisible: false,
        loadProgress: 0,
        visibleTiles: 0,
        activeTiles: 0,
        trackedMeshes: this.meshRegistry.getTrackedMeshCount(),
      };
    }

    return {
      hasRenderer: true,
      isDisposed: this.disposed,
      isVisible: renderer.group.visible,
      loadProgress: renderer.loadProgress,
      visibleTiles: renderer.visibleTiles.size,
      activeTiles: renderer.activeTiles.size,
      trackedMeshes: this.meshRegistry.getTrackedMeshCount(),
    };
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
      this.activeCamera = null;
      return;
    }

    if (this.activeCamera) {
      this.renderer.deleteCamera(this.activeCamera);
    }

    this.renderer.group.removeFromParent();
    this.renderer.removeEventListener("load-model", this.handleLoadModel);
    this.renderer.removeEventListener("dispose-model", this.handleDisposeModel);
    this.meshRegistry.dispose();
    this.renderer.dispose();
    this.renderer = null;
    this.activeCamera = null;
  }
}

function isSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}
