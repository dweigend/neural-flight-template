import * as THREE from "three";
import { BERLIN_TILE_RUNTIME } from "../constants";

export interface TilesRendererLike {
  readonly group: THREE.Group;
  fetchOptions: any;
  setCamera(camera: THREE.PerspectiveCamera): void;
  setResolutionFromRenderer(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ): void;
  update(): void;
  dispose(): void;
}

export interface TilesRendererConstructor {
  new (url: string): TilesRendererLike;
}

/**
 * Loads the TilesRenderer constructor and ensures it uses the same THREE instance.
 */
export async function loadTilesRendererConstructor(): Promise<TilesRendererConstructor | null> {
  // We import the module from the CDN
  const moduleUrl = BERLIN_TILE_RUNTIME.moduleUrl;

  try {
    const moduleExports: any = await import(/* @vite-ignore */ moduleUrl);
    if (!moduleExports) return null;

    // The 3d-tiles-renderer library often exports TilesRenderer
    const constructor = moduleExports.TilesRenderer;
    return typeof constructor === "function"
      ? (constructor as TilesRendererConstructor)
      : null;
  } catch (err) {
    console.error("[TilesRendererModule] Failed to load module from CDN:", err);
    return null;
  }
}
