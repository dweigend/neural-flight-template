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
  BerlinConeDatasetLoadError,
  type BerlinConeDatasetLoadErrorCode,
  createBerlinConeDatasetAssetLoader,
  type BerlinConeDatasetAssetLoader,
} from "./asset-loader";

export interface BerlinConeChunkRuntimeDiagnostics {
  playerChunkKey: string | null;
  desiredChunkCount: number;
  inBoundsChunkCount: number;
  loadedDesiredChunkCount: number;
  activeChunkCount: number;
  activeConeCount: number;
  manifestLoaded: boolean;
  outOfBounds: boolean;
  emptyNearby: boolean;
  errorCode: BerlinConeDatasetLoadErrorCode | null;
  errorChunkKey: string | null;
  errorMessage: string | null;
}

export class BerlinConeChunkRuntimeStore {
  private readonly assetLoader: BerlinConeDatasetAssetLoader;
  private manifestPromise: Promise<BerlinConeDatasetManifest> | null = null;
  private manifest: BerlinConeDatasetManifest | null = null;
  private readonly loadedChunks = new Map<string, BerlinConeChunkSnapshot>();
  private activeChunkSnapshots: readonly BerlinConeChunkSnapshot[] = [];
  private activeCones: readonly BerlinConeVolume[] = [];
  private snapshotVersion = 0;
  private lastError: Error | null = null;
  private diagnostics: BerlinConeChunkRuntimeDiagnostics =
    createEmptyConeChunkRuntimeDiagnostics();

  constructor(
    assetLoader: BerlinConeDatasetAssetLoader = createBerlinConeDatasetAssetLoader(),
  ) {
    this.assetLoader = assetLoader;
  }

  public async update(playerPosition: THREE.Vector3): Promise<void> {
    const center = getConeChunkCoordinate(playerPosition);
    const desiredChunkKeys = collectConeChunkKeys(
      center,
      BERLIN_CONE_GRID.LOAD_RADIUS_CHUNKS,
    );
    let inBoundsChunkKeys: readonly string[] = [];
    this.diagnostics.playerChunkKey = `${center.x}:${center.z}`;
    this.diagnostics.desiredChunkCount = desiredChunkKeys.length;

    try {
      const manifest = await this.loadManifest();
      inBoundsChunkKeys = desiredChunkKeys.filter((chunkKey) =>
        this.isChunkInBounds(manifest, chunkKey),
      );
      this.diagnostics.manifestLoaded = true;
      this.diagnostics.inBoundsChunkCount = inBoundsChunkKeys.length;

      await this.loadMissingChunks(inBoundsChunkKeys);
      this.unloadFarChunks(center);
      this.refreshActiveState(inBoundsChunkKeys);
      this.lastError = null;
      this.clearDiagnosticError();
      this.refreshDiagnostics(inBoundsChunkKeys);
    } catch (error) {
      this.lastError = toError(error);
      this.applyDiagnosticError(this.lastError);
      this.refreshDiagnostics(inBoundsChunkKeys);
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

  public getDiagnostics(): BerlinConeChunkRuntimeDiagnostics {
    return { ...this.diagnostics };
  }

  private async loadMissingChunks(desiredChunkKeys: readonly string[]): Promise<void> {
    let loadsStarted = 0;

    for (const chunkKey of desiredChunkKeys) {
      if (this.loadedChunks.has(chunkKey)) {
        continue;
      }

      if (loadsStarted >= BERLIN_CONE_GRID.MAX_CHUNK_LOADS_PER_TICK) {
        return;
      }

      const snapshot = await this.loadChunkOrEmpty(chunkKey);
      this.loadedChunks.set(chunkKey, snapshot);
      loadsStarted += 1;
    }
  }

  private async loadChunkOrEmpty(
    chunkKey: string,
  ): Promise<BerlinConeChunkSnapshot> {
    try {
      return await this.assetLoader.loadChunk(chunkKey);
    } catch (error) {
      if (
        error instanceof BerlinConeDatasetLoadError &&
        error.code === "chunk-missing"
      ) {
        return {
          key: chunkKey,
          cones: [],
        };
      }

      throw error;
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

  private refreshDiagnostics(desiredChunkKeys: readonly string[]): void {
    const loadedDesiredChunkCount = desiredChunkKeys.reduce(
      (count, chunkKey) => count + (this.loadedChunks.has(chunkKey) ? 1 : 0),
      0,
    );

    this.diagnostics.loadedDesiredChunkCount = loadedDesiredChunkCount;
    this.diagnostics.activeChunkCount = this.activeChunkSnapshots.length;
    this.diagnostics.activeConeCount = this.activeCones.length;
    this.diagnostics.outOfBounds =
      this.diagnostics.manifestLoaded && this.diagnostics.inBoundsChunkCount === 0;
    this.diagnostics.emptyNearby =
      !this.diagnostics.outOfBounds &&
      this.diagnostics.errorCode === null &&
      this.diagnostics.inBoundsChunkCount > 0 &&
      loadedDesiredChunkCount === this.diagnostics.inBoundsChunkCount &&
      this.activeCones.length === 0;
  }

  private clearDiagnosticError(): void {
    this.diagnostics.errorCode = null;
    this.diagnostics.errorChunkKey = null;
    this.diagnostics.errorMessage = null;
  }

  private applyDiagnosticError(error: Error): void {
    const datasetError =
      error instanceof BerlinConeDatasetLoadError ? error : null;
    this.diagnostics.errorCode = datasetError?.code ?? "load-error";
    this.diagnostics.errorChunkKey = datasetError?.chunkKey ?? null;
    this.diagnostics.errorMessage = error.message;
    if (datasetError?.code === "manifest-missing" || datasetError?.code === "manifest-invalid") {
      this.diagnostics.manifestLoaded = false;
    }
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

function createEmptyConeChunkRuntimeDiagnostics(): BerlinConeChunkRuntimeDiagnostics {
  return {
    playerChunkKey: null,
    desiredChunkCount: 0,
    inBoundsChunkCount: 0,
    loadedDesiredChunkCount: 0,
    activeChunkCount: 0,
    activeConeCount: 0,
    manifestLoaded: false,
    outOfBounds: false,
    emptyNearby: false,
    errorCode: null,
    errorChunkKey: null,
    errorMessage: null,
  };
}
