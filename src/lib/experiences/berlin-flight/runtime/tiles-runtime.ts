import { TilesRenderer } from "3d-tiles-renderer";
import type { Camera, WebGLRenderer, Group } from "three";

/**
 * Adapter for the 3D Tiles runtime.
 * This isolates the specific loader (3d-tiles-renderer) from the experience logic.
 */
export class TilesRuntimeAdapter {
  private renderer: TilesRenderer | null = null;
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /**
   * Initializes and loads the tileset.
   */
  public async loadTiles(group: Group): Promise<TilesRenderer> {
    if (this.renderer) {
      return this.renderer;
    }

    try {
      this.renderer = new TilesRenderer(this.url);

      // Pass the access token in the headers for all tile requests
      this.renderer.fetchOptions.headers = {
        Authorization: `Bearer ${this.token}`,
      };

      // Add the tileset to the provided group
      group.add(this.renderer.group);

      // Basic configuration for VR performance
      this.renderer.errorTarget = 12; // Higher value = lower quality, better performance

      console.log("[BerlinFlight] 3D Tiles renderer initialized.");
      return this.renderer;
    } catch (error) {
      console.error(
        "[BerlinFlight] Failed to initialize 3D Tiles renderer:",
        error,
      );
      throw error;
    }
  }

  /**
   * Updates the tileset every frame.
   */
  public update(camera: Camera, webglRenderer: WebGLRenderer): void {
    if (!this.renderer) return;

    this.renderer.setCamera(camera);
    this.renderer.setResolutionFromRenderer(camera, webglRenderer);
    this.renderer.update();
  }

  /**
   * Cleans up resources.
   */
  public dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
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
