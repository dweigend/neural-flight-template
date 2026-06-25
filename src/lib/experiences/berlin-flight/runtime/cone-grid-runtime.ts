import * as THREE from "three";
import type {
  BerlinConeChunkSnapshot,
  BerlinConeVolume,
} from "../collision/types";
import { BERLIN_CONE_GRID } from "../constants";
import {
  createConeGridChunk,
  type ConeGridChunk,
} from "./cone-grid-chunk";
import {
  type ActiveConeChunkSnapshotSource,
  buildConeSnapshotState,
} from "./cone-grid-snapshots";
import {
  collectConeChunkKeys,
  getConeChunkCoordinate,
  getConeChunkKey,
  parseConeChunkKey,
  type ConeChunkCoordinate,
} from "./cone-grid-coordinates";

type ActiveConeChunk = ActiveConeChunkSnapshotSource & ConeGridChunk;

const leftDistance = new THREE.Vector2();
const rightDistance = new THREE.Vector2();

export class BerlinConeGridRuntime {
  public readonly root = new THREE.Group();

  private readonly activeChunks = new Map<string, ActiveConeChunk>();
  private readonly coneGeometry: THREE.ConeGeometry;
  private readonly coneMaterial: THREE.MeshBasicMaterial;
  private activeConeChunksSnapshot: readonly BerlinConeChunkSnapshot[] = [];
  private activeConeVolumes: readonly BerlinConeVolume[] = [];
  private lastObserverChunkKey: string | null = null;
  private needsReconcile = true;
  private snapshotsDirty = true;
  private snapshotVersion = 0;
  private disposed = false;

  constructor() {
    this.root.name = "BerlinConeGridRoot";
    this.coneGeometry = new THREE.ConeGeometry(
      BERLIN_CONE_GRID.CONE_RADIUS,
      BERLIN_CONE_GRID.CONE_HEIGHT,
      16,
      1,
      true,
    );
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: BERLIN_CONE_GRID.COLOR,
      wireframe: true,
    });
  }

  public update(observerPosition: THREE.Vector3): void {
    if (this.disposed) return;

    const observerChunk = getConeChunkCoordinate(observerPosition);
    const observerChunkKey = getConeChunkKey(observerChunk);

    if (observerChunkKey !== this.lastObserverChunkKey) {
      this.lastObserverChunkKey = observerChunkKey;
      this.needsReconcile = true;
    }

    if (!this.needsReconcile) return;

    this.reconcile(observerChunk);
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (const chunk of this.activeChunks.values()) {
      chunk.mesh.removeFromParent();
    }
    this.activeChunks.clear();
    this.activeConeChunksSnapshot = [];
    this.activeConeVolumes = [];

    this.coneGeometry.dispose();
    this.coneMaterial.dispose();
    this.root.clear();
  }

  public getActiveCones(): readonly BerlinConeVolume[] {
    this.refreshSnapshots();
    return this.activeConeVolumes;
  }

  public getActiveConeChunks(): readonly BerlinConeChunkSnapshot[] {
    this.refreshSnapshots();
    return this.activeConeChunksSnapshot;
  }

  public getSnapshotVersion(): number {
    return this.snapshotVersion;
  }

  private reconcile(observerChunk: ConeChunkCoordinate): void {
    const desiredChunkKeys = new Set<string>(
      collectConeChunkKeys(
        observerChunk,
        BERLIN_CONE_GRID.LOAD_RADIUS_CHUNKS,
      ),
    );
    const retainedChunkKeys = new Set<string>(
      collectConeChunkKeys(
        observerChunk,
        BERLIN_CONE_GRID.UNLOAD_RADIUS_CHUNKS,
      ),
    );

    for (const [chunkKey, chunk] of this.activeChunks) {
      if (retainedChunkKeys.has(chunkKey)) continue;

      chunk.mesh.removeFromParent();
      this.activeChunks.delete(chunkKey);
      this.snapshotsDirty = true;
      this.snapshotVersion += 1;
    }

    const missingChunks = Array.from(desiredChunkKeys)
      .filter((chunkKey) => !this.activeChunks.has(chunkKey))
      .map((chunkKey) => parseConeChunkKey(chunkKey))
      .sort((left, right) => {
        leftDistance.set(left.x - observerChunk.x, left.z - observerChunk.z);
        rightDistance.set(right.x - observerChunk.x, right.z - observerChunk.z);
        return leftDistance.lengthSq() - rightDistance.lengthSq();
      });

    const chunkLoadCount = Math.min(
      missingChunks.length,
      BERLIN_CONE_GRID.MAX_CHUNK_LOADS_PER_TICK,
    );

    for (let chunkIndex = 0; chunkIndex < chunkLoadCount; chunkIndex += 1) {
      const chunkCoordinate = missingChunks[chunkIndex];
      const chunk = createConeGridChunk(
        chunkCoordinate,
        this.coneGeometry,
        this.coneMaterial,
      );
      this.activeChunks.set(chunk.key, chunk);
      this.root.add(chunk.mesh);
      this.snapshotsDirty = true;
      this.snapshotVersion += 1;
    }

    this.needsReconcile = missingChunks.length > chunkLoadCount;
  }

  private refreshSnapshots(): void {
    if (!this.snapshotsDirty) return;

    const { chunkSnapshots, coneVolumes } = buildConeSnapshotState(
      this.activeChunks.values(),
    );
    this.activeConeChunksSnapshot = chunkSnapshots;
    this.activeConeVolumes = coneVolumes;
    this.snapshotsDirty = false;
  }
}
