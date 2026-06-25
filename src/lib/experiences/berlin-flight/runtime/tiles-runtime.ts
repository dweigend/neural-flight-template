import { TilesRenderer } from "3d-tiles-renderer";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import type { Camera, Group, WebGLRenderer } from "three";

const BERLIN_TILE_GREY = 0xbeeeef;

type TileLoadEvent = {
  scene: THREE.Object3D;
  tile: unknown;
  type: "load-model";
  url: string;
};

type TileMaterialMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

type MaterialWithTextureMaps = THREE.Material & {
  alphaMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  map?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  specularMap?: THREE.Texture | null;
};

function createBerlinTileMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: BERLIN_TILE_GREY,
    depthTest: true,
    depthWrite: true,
    flatShading: true,
    metalness: 0,
    opacity: 0.6,
    roughness: 0.5,
    transparent: true,
  });
}

function disposeMaterialTextures(material: THREE.Material): void {
  const materialWithMaps = material as MaterialWithTextureMaps;

  materialWithMaps.map?.dispose();
  materialWithMaps.alphaMap?.dispose();
  materialWithMaps.aoMap?.dispose();
  materialWithMaps.bumpMap?.dispose();
  materialWithMaps.displacementMap?.dispose();
  materialWithMaps.emissiveMap?.dispose();
  materialWithMaps.lightMap?.dispose();
  materialWithMaps.metalnessMap?.dispose();
  materialWithMaps.normalMap?.dispose();
  materialWithMaps.roughnessMap?.dispose();
  materialWithMaps.specularMap?.dispose();
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeMaterialTextures(entry);
      entry.dispose();
    }
    return;
  }

  disposeMaterialTextures(material);
  material.dispose();
}

function overrideTileSceneMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!(child.geometry instanceof THREE.BufferGeometry)) return;

    const mesh = child as TileMaterialMesh;
    const originalMaterial = mesh.material;
    mesh.material = createBerlinTileMaterial();
    disposeMaterial(originalMaterial);
  });
}

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
  private readonly activeCameras = new Set<Camera>();
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
    renderer.addEventListener("load-model", this.handleLoadModel);
  }

  private readonly handleLoadModel = (event: TileLoadEvent): void => {
    overrideTileSceneMaterials(event.scene);
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

    this.renderer.group.removeFromParent();
    this.renderer.removeEventListener("load-model", this.handleLoadModel);
    this.renderer.dispose();
    this.renderer = null;
    this.loadPromise = null;
    this.activeCameras.clear();
  }
}
