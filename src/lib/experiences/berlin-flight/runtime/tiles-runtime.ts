import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import type { Camera, Group, WebGLRenderer } from "three";
import { BerlinTileMeshRegistry } from "../collision/mesh-tracker";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { BERLIN_TILE_RUNTIME } from "../constants";
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

/**
 * Adapter for the 3D Tiles runtime.
 * This isolates the specific loader (3d-tiles-renderer) from the experience logic.
 */
export class TilesRuntimeAdapter {
  private renderer: TilesRenderer | null = null;
  private activeCameras: Camera[] = [];
  private readonly meshRegistry = new BerlinTileMeshRegistry();
  private readonly resolution = new THREE.Vector2();
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
      this.activeCameras = [];
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

    renderer.errorTarget = 20;
    renderer.downloadQueue.maxJobs = BERLIN_TILE_RUNTIME.DOWNLOAD_JOBS;
    renderer.parseQueue.maxJobs = BERLIN_TILE_RUNTIME.PARSE_JOBS;
    renderer.processNodeQueue.maxJobs = BERLIN_TILE_RUNTIME.PROCESS_NODE_JOBS;
    renderer.maxTilesProcessed = BERLIN_TILE_RUNTIME.MAX_TILES_PROCESSED;
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
    const nextCameras = cameras.filter(
      (camera, index) => cameras.indexOf(camera) === index,
    );

    for (const camera of this.activeCameras) {
      if (nextCameras.includes(camera)) {
        continue;
      }

      renderer.deleteCamera(camera);
    }

    for (const camera of nextCameras) {
      camera.updateMatrixWorld(true);
      if (!renderer.hasCamera(camera)) {
        renderer.setCamera(camera);
      }
    }

    webglRenderer.getSize(this.resolution);
    for (const camera of nextCameras) {
      renderer.setResolution(camera, this.resolution);
    }

    this.activeCameras = [...nextCameras];
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
      this.activeCameras = [];
      return;
    }

    for (const camera of this.activeCameras) {
      this.renderer.deleteCamera(camera);
    }

    this.renderer.group.removeFromParent();
    this.renderer.removeEventListener("load-model", this.handleLoadModel);
    this.renderer.removeEventListener("dispose-model", this.handleDisposeModel);
    this.meshRegistry.dispose();
    this.renderer.dispose();
    this.renderer = null;
    this.activeCameras = [];
  }
}

function isSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}
