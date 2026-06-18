import { TilesRenderer } from "3d-tiles-renderer";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import type { Camera, Group, WebGLRenderer } from "three";
import { removeFromParent } from "./cleanup";

export interface TilesRuntimeDebugStats {
  hasRenderer: boolean;
  isDisposed: boolean;
  isVisible: boolean;
  loadProgress: number;
  visibleTiles: number;
  activeTiles: number;
}

/**
 * Adapter for the 3D Tiles runtime.
 * This isolates the specific loader (3d-tiles-renderer) from the experience logic.
 */
export class TilesRuntimeAdapter {
  private renderer: TilesRenderer | null = null;
  private loadPromise: Promise<TilesRenderer> | null = null;
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
  }

  /**
   * Updates the tileset every frame.
   */
  public update(camera: Camera, webglRenderer: WebGLRenderer): void {
    if (this.disposed) return;
    if (!this.renderer) return;
    if (!this.renderer.group.visible) return;

    this.renderer.group.updateMatrixWorld(true);
    this.renderer.setCamera(camera);
    this.renderer.setResolutionFromRenderer(camera, webglRenderer);
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
  }

  /**
   * Cleans up resources.
   */
  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (!this.renderer) {
      this.loadPromise = null;
      return;
    }

    removeFromParent(this.renderer.group);
    this.renderer.dispose();
    this.renderer = null;
    this.loadPromise = null;
  }

  /**
   * Returns the underlying renderer instance.
   */
  public getRenderer(): TilesRenderer | null {
    return this.renderer;
  }
}

/**
 * Factory function to create a tiles runtime.
 */
export function createTilesRuntime(
  url: string,
  token: string,
): TilesRuntimeAdapter {
  return new TilesRuntimeAdapter(url, token);
}
