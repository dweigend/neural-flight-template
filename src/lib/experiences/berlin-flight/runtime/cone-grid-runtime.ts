import * as THREE from "three";
import type {
  BerlinConeChunkSnapshot,
  BerlinConeVolume,
} from "../collision/types";
import { BERLIN_CONE_GRID } from "./cone-grid-config";

const localDownAxis = new THREE.Vector3(0, -1, 0);
const scratchCenter = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const instanceDummy = new THREE.Object3D();

export class BerlinConeGridRuntime {
  public readonly root = new THREE.Group();

  private readonly coneGeometry: THREE.ConeGeometry;
  private readonly coneMaterial: THREE.MeshBasicMaterial;
  private mesh: THREE.InstancedMesh | null = null;
  private activeConeChunksSnapshot: readonly BerlinConeChunkSnapshot[] = [];
  private activeConeVolumes: readonly BerlinConeVolume[] = [];
  private sourceVersion = -1;
  private snapshotVersion = 0;
  private disposed = false;

  constructor() {
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
  }

  public setActiveCones(
    cones: readonly BerlinConeVolume[],
    sourceVersion: number,
  ): void {
    if (this.disposed) return;
    if (this.sourceVersion === sourceVersion) return;

    this.sourceVersion = sourceVersion;
    this.activeConeVolumes = cones.slice().sort(compareConeVolumes);
    this.activeConeChunksSnapshot =
      this.activeConeVolumes.length === 0
        ? []
        : [
            {
              key: "active",
              cones: this.activeConeVolumes,
            },
          ];
    this.rebuildMesh();
    this.snapshotVersion += 1;
  }

  public update(_observerPosition: THREE.Vector3): void {
    if (this.disposed) return;
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.mesh?.removeFromParent();
    this.mesh = null;
    this.activeConeChunksSnapshot = [];
    this.activeConeVolumes = [];
    this.sourceVersion = -1;

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
  return left.placementPointId.localeCompare(right.placementPointId);
}
