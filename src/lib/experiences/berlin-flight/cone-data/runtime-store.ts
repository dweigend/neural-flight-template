import type * as THREE from "three";
import type { BerlinConeChunkSnapshot, BerlinConeVolume } from "../collision/types";
import { buildConeSnapshotState } from "../runtime/cone-grid-snapshots";
import { BERLIN_CONE_GRID } from "../runtime/cone-grid-config";
import {
  collectConeChunkKeys,
  getConeChunkCoordinate,
  parseConeChunkKey,
} from "../runtime/cone-grid-coordinates";
import type { BerlinConeDatasetManifest } from "./contracts";
import {
  createBerlinConeDatasetAssetLoader,
  type BerlinConeDatasetAssetLoader,
} from "./asset-loader";

export class BerlinConeChunkRuntimeStore {
  private readonly assetLoader: BerlinConeDatasetAssetLoader;
  private manifestPromise: Promise<BerlinConeDatasetManifest> | null = null;
  private manifest: BerlinConeDatasetManifest | null = null;
  private readonly loadedChunks = new Map<string, BerlinConeChunkSnapshot>();
  private activeChunkSnapshots: readonly BerlinConeChunkSnapshot[] = [];
  private activeCones: readonly BerlinConeVolume[] = [];
  private snapshotVersion = 0;
  private lastError: Error | null = null;

  constructor(
    assetLoader: BerlinConeDatasetAssetLoader = createBerlinConeDatasetAssetLoader(),
  ) {
    this.assetLoader = assetLoader;
  }

  public async update(playerPosition: THREE.Vector3): Promise<void> {
    try {
      const manifest = await this.loadManifest();
      const center = getConeChunkCoordinate(playerPosition);
      const desiredChunkKeys = collectConeChunkKeys(
        center,
        BERLIN_CONE_GRID.LOAD_RADIUS_CHUNKS,
      ).filter((chunkKey) => this.isChunkInBounds(manifest, chunkKey));

      await this.loadMissingChunks(desiredChunkKeys);
      this.unloadFarChunks(center);
      this.refreshActiveState(desiredChunkKeys);
      this.lastError = null;
    } catch (error) {
      this.lastError = toError(error);
      throw this.lastError;
    }
  }

  public async loadManifest(): Promise<BerlinConeDatasetManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    if (!this.manifestPromise) {
      this.manifestPromise = this.assetLoader.loadManifest();
    }

    this.manifest = await this.manifestPromise;
    return this.manifest;
  }

  public getActiveConeChunks(): readonly BerlinConeChunkSnapshot[] {
    return this.activeChunkSnapshots;
  }

  public getActiveCones(): readonly BerlinConeVolume[] {
    return this.activeCones;
  }

  public getSnapshotVersion(): number {
    return this.snapshotVersion;
  }

  public getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }

  public getLastError(): Error | null {
    return this.lastError;
  }

  private async loadMissingChunks(desiredChunkKeys: readonly string[]): Promise<void> {
    for (const chunkKey of desiredChunkKeys) {
      if (this.loadedChunks.has(chunkKey)) {
        continue;
      }

      const snapshot = await this.assetLoader.loadChunk(chunkKey);
      this.loadedChunks.set(chunkKey, snapshot);
    }
  }

  private unloadFarChunks(center: { x: number; z: number }): void {
    const unloadRadius = BERLIN_CONE_GRID.UNLOAD_RADIUS_CHUNKS;

    for (const chunkKey of this.loadedChunks.keys()) {
      const coordinate = parseConeChunkKey(chunkKey);
      if (
        Math.abs(coordinate.x - center.x) <= unloadRadius &&
        Math.abs(coordinate.z - center.z) <= unloadRadius
      ) {
        continue;
      }

      this.loadedChunks.delete(chunkKey);
    }
  }

  private refreshActiveState(desiredChunkKeys: readonly string[]): void {
    const nextChunks = desiredChunkKeys
      .map((chunkKey) => this.loadedChunks.get(chunkKey))
      .filter((chunk): chunk is BerlinConeChunkSnapshot => chunk !== undefined);
    const nextState = buildConeSnapshotState(nextChunks);
    const nextSignature = createSnapshotSignature(nextState.chunkSnapshots);
    const previousSignature = createSnapshotSignature(this.activeChunkSnapshots);

    if (nextSignature === previousSignature) {
      return;
    }

    this.activeChunkSnapshots = nextState.chunkSnapshots;
    this.activeCones = nextState.coneVolumes;
    this.snapshotVersion += 1;
  }

  private isChunkInBounds(
    manifest: BerlinConeDatasetManifest,
    chunkKey: string,
  ): boolean {
    const coordinate = parseConeChunkKey(chunkKey);
    return (
      coordinate.x >= manifest.bounds.minChunkX &&
      coordinate.x <= manifest.bounds.maxChunkX &&
      coordinate.z >= manifest.bounds.minChunkZ &&
      coordinate.z <= manifest.bounds.maxChunkZ
    );
  }
}

function createSnapshotSignature(
  chunks: readonly BerlinConeChunkSnapshot[],
): string {
  return chunks.map((chunk) => `${chunk.key}:${chunk.cones.length}`).join("|");
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
