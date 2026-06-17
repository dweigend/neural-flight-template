import * as THREE from "three";
import { BERLIN_TILE_RUNTIME } from "../constants";

export interface TilesRendererLike {
  readonly group: THREE.Group;
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

export async function loadTilesRendererConstructor(): Promise<TilesRendererConstructor | null> {
  const moduleExports: unknown = await import(
    /* @vite-ignore */ BERLIN_TILE_RUNTIME.moduleUrl
  );
  if (!isRecord(moduleExports)) return null;

  const constructor = moduleExports.TilesRenderer;
  return typeof constructor === "function"
    ? (constructor as TilesRendererConstructor)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
