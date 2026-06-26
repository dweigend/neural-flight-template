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
  getConeGridCoordinate,
  getConeGridKey,
  getConeChunkKey,
  parseConeChunkKey,
  type ConeChunkCoordinate,
  type ConeGridCoordinate,
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
  private lastObserverGridKey: string | null = null;
  private needsReconcile = true;
  private needsVisibilityRefresh = true;
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
    const observerGrid = getConeGridCoordinate(observerPosition);
    const observerGridKey = getConeGridKey(observerGrid);

    if (observerChunkKey !== this.lastObserverChunkKey) {
      this.lastObserverChunkKey = observerChunkKey;
      this.needsReconcile = true;
    }

    if (observerGridKey !== this.lastObserverGridKey) {
      this.lastObserverGridKey = observerGridKey;
      this.needsVisibilityRefresh = true;
    }

    if (this.needsReconcile) {
      this.reconcile(observerChunk);
    }

    if (!this.needsVisibilityRefresh) return;

    this.refreshChunkVisibility(observerGrid);
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
      this.needsVisibilityRefresh = true;
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
      this.needsVisibilityRefresh = true;
      this.snapshotsDirty = true;
      this.snapshotVersion += 1;
    }

    this.needsReconcile = missingChunks.length > chunkLoadCount;
  }

  private refreshChunkVisibility(observerGrid: ConeGridCoordinate): void {
    for (const chunk of this.activeChunks.values()) {
      let visibleConeCount = 0;
      chunk.cones.length = 0;

      for (let coneIndex = 0; coneIndex < chunk.allCones.length; coneIndex += 1) {
        const cone = chunk.allCones[coneIndex];
        const coneGridX = Math.round(cone.center.x / BERLIN_CONE_GRID.SPACING);
        const coneGridZ = Math.round(cone.center.z / BERLIN_CONE_GRID.SPACING);
        const isVisible =
          Math.abs(coneGridX - observerGrid.x) <=
            BERLIN_CONE_GRID.VISIBLE_RADIUS_TILES &&
          Math.abs(coneGridZ - observerGrid.z) <=
            BERLIN_CONE_GRID.VISIBLE_RADIUS_TILES;

        if (!isVisible) continue;

        chunk.mesh.setMatrixAt(visibleConeCount, chunk.matrices[coneIndex]);
        chunk.cones.push(cone);
        visibleConeCount += 1;
      }

      chunk.mesh.count = visibleConeCount;
      chunk.mesh.instanceMatrix.needsUpdate = true;
    }

    this.needsVisibilityRefresh = false;
    this.snapshotsDirty = true;
    this.snapshotVersion += 1;
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
