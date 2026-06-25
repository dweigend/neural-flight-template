import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import type { Camera, Group, WebGLRenderer } from "three";
import { BerlinTileMeshRegistry } from "../collision/mesh-tracker";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import {
  configureBerlinTilesRenderer,
  type TileDisposeEvent,
  type TileLoadEvent,
} from "./tiles-renderer-config";

export interface TilesRuntimeDebugStats {
  hasRenderer: boolean;
  isDisposed: boolean;
  isVisible: boolean;
  loadProgress: number;
  visibleTiles: number;
  activeTiles: number;
  trackedMeshes: number;
}

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
    configureBerlinTilesRenderer(
      renderer,
      this.url,
      this.token,
      this.handleLoadModel,
      this.handleDisposeModel,
    );
  }

  private readonly handleLoadModel = (event: TileLoadEvent): void => {
    this.meshRegistry.trackTileScene(event.scene);
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
