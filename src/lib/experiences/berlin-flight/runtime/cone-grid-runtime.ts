import * as THREE from "three";
import type {
  BerlinConeChunkSnapshot,
  BerlinConeVolume,
} from "../collision/types";
import {
  BerlinConeChunkRuntimeStore,
} from "../cone-data/runtime-store";
import type { BerlinConeDatasetAssetLoader } from "../cone-data/asset-loader";
import { BERLIN_CONE_GRID } from "./cone-grid-config";
import { buildConeSnapshotState } from "./cone-grid-snapshots";

const localDownAxis = new THREE.Vector3(0, -1, 0);
const scratchCenter = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const instanceDummy = new THREE.Object3D();

export interface BerlinConeRuntimeDebugStats {
  activeChunkCount: number;
  activeCones: number;
  hasLoadError: boolean;
  loadedChunkCount: number;
  loading: boolean;
}

export class BerlinConeGridRuntime {
  public readonly root = new THREE.Group();

  private readonly coneGeometry: THREE.ConeGeometry;
  private readonly coneMaterial: THREE.MeshBasicMaterial;
  private readonly chunkStore: BerlinConeChunkRuntimeStore;
  private readonly queuedObserverPosition = new THREE.Vector3();
  private mesh: THREE.InstancedMesh | null = null;
  private activeConeChunksSnapshot: readonly BerlinConeChunkSnapshot[] = [];
  private activeConeVolumes: readonly BerlinConeVolume[] = [];
  private snapshotVersion = 0;
  private disposed = false;
  private loading = false;
  private loadError: Error | null = null;
  private hasQueuedObserverPosition = false;

  constructor(assetLoader?: BerlinConeDatasetAssetLoader) {
    this.root.name = "BerlinConeGridRoot";
    this.root.visible = false;
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
    this.chunkStore = new BerlinConeChunkRuntimeStore(assetLoader);
  }

  public update(observerPosition: THREE.Vector3): void {
    if (this.disposed) return;

    if (this.loading) {
      this.queuedObserverPosition.copy(observerPosition);
      this.hasQueuedObserverPosition = true;
      return;
    }

    this.loading = true;
    const requestedPosition = observerPosition.clone();
    void this.chunkStore
      .update(requestedPosition)
      .then(() => {
        if (this.disposed) {
          return;
        }

        this.loadError = null;
        this.syncFromChunkStore();
      })
      .catch((error: unknown) => {
        const nextError =
          error instanceof Error ? error : new Error(String(error));
        const shouldLog = this.loadError?.message !== nextError.message;
        this.loadError = nextError;
        if (shouldLog) {
          console.error(
            "[BerlinFlight] Failed to update precomputed cone chunks:",
            error,
          );
        }
      })
      .finally(() => {
        this.loading = false;
        if (this.disposed || !this.hasQueuedObserverPosition) {
          return;
        }

        this.hasQueuedObserverPosition = false;
        this.update(this.queuedObserverPosition);
      });
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.mesh?.removeFromParent();
    this.mesh = null;
    this.activeConeChunksSnapshot = [];
    this.activeConeVolumes = [];
    this.snapshotVersion = 0;
    this.loadError = null;

    this.coneGeometry.dispose();
    this.coneMaterial.dispose();
    this.root.clear();
  }

  public getActiveCones(): readonly BerlinConeVolume[] {
    return this.activeConeVolumes;
  }

  public getActiveConeChunks(): readonly BerlinConeChunkSnapshot[] {
    return this.activeConeChunksSnapshot;
  }

  public getSnapshotVersion(): number {
    return this.snapshotVersion;
  }

  public getLoadError(): Error | null {
    return this.loadError;
  }

  public getDebugStats(): BerlinConeRuntimeDebugStats {
    return {
      activeChunkCount: this.activeConeChunksSnapshot.length,
      activeCones: this.activeConeVolumes.length,
      hasLoadError: this.loadError !== null,
      loadedChunkCount: this.chunkStore.getLoadedChunkCount(),
      loading: this.loading,
    };
  }

  private syncFromChunkStore(): void {
    if (this.snapshotVersion === this.chunkStore.getSnapshotVersion()) {
      return;
    }

    const nextState = buildConeSnapshotState(this.chunkStore.getActiveConeChunks());
    this.activeConeChunksSnapshot = nextState.chunkSnapshots;
    this.activeConeVolumes = nextState.coneVolumes
      .slice()
      .sort(compareConeVolumes);
    this.rebuildMesh();
    this.snapshotVersion = this.chunkStore.getSnapshotVersion();
  }

  private rebuildMesh(): void {
    this.mesh?.removeFromParent();
    this.mesh = null;

    if (this.activeConeVolumes.length === 0) {
      return;
    }

    const mesh = new THREE.InstancedMesh(
      this.coneGeometry,
      this.coneMaterial,
      this.activeConeVolumes.length,
    );
    mesh.name = "BerlinConeInstances";

    for (
      let coneIndex = 0;
      coneIndex < this.activeConeVolumes.length;
      coneIndex += 1
    ) {
      const cone = this.activeConeVolumes[coneIndex];
      buildConeMatrix(cone, instanceDummy);
      mesh.setMatrixAt(coneIndex, instanceDummy.matrix);
    }

    mesh.count = this.activeConeVolumes.length;
    mesh.instanceMatrix.needsUpdate = true;
    this.mesh = mesh;
    this.root.add(mesh);
  }
}

function buildConeMatrix(
  cone: BerlinConeVolume,
  target: THREE.Object3D,
): void {
  scratchCenter
    .copy(cone.tip)
    .addScaledVector(cone.axisDirection, cone.height * 0.5);
  scratchQuaternion.setFromUnitVectors(localDownAxis, cone.axisDirection);
  scratchScale.set(
    cone.radius / BERLIN_CONE_GRID.CONE_RADIUS,
    cone.height / BERLIN_CONE_GRID.CONE_HEIGHT,
    cone.radius / BERLIN_CONE_GRID.CONE_RADIUS,
  );

  target.position.copy(scratchCenter);
  target.quaternion.copy(scratchQuaternion);
  target.scale.copy(scratchScale);
  target.updateMatrix();
}

function compareConeVolumes(
  left: BerlinConeVolume,
  right: BerlinConeVolume,
): number {
  if (left.chunkKey !== right.chunkKey) {
    return left.chunkKey.localeCompare(right.chunkKey);
  }

  if (left.coneIndex !== right.coneIndex) {
    return left.coneIndex - right.coneIndex;
  }

  return left.placementPointId.localeCompare(right.placementPointId);
}
