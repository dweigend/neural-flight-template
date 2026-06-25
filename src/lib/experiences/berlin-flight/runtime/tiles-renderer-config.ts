import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import type { TilesRenderer } from "3d-tiles-renderer";

export type TileLoadEvent = {
  scene: THREE.Object3D;
  tile: unknown;
  type: "load-model";
  url: string;
};

export type TileDisposeEvent = {
  scene: THREE.Object3D;
  tile: unknown;
  type: "dispose-model";
};

export function configureBerlinTilesRenderer(
  renderer: TilesRenderer,
  url: string,
  token: string,
  handleLoadModel: (event: TileLoadEvent) => void,
  handleDisposeModel: (event: TileDisposeEvent) => void,
): void {
  const isGoogleTiles = url.includes("tile.googleapis.com");

  if (isGoogleTiles) {
    const parsedUrl = new URL(url);
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

  if (token && !isGoogleTiles) {
    renderer.fetchOptions.headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  renderer.errorTarget = 12;
  renderer.addEventListener("load-model", handleLoadModel);
  renderer.addEventListener("dispose-model", handleDisposeModel);
}
