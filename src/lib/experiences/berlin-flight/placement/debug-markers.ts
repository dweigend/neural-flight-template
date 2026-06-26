import * as THREE from "three";
import { BERLIN_PLACEMENT } from "./config";
import type { BerlinAcceptedShadowOriginPoint } from "./types";

const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3(
  BERLIN_PLACEMENT.DEBUG_MARKERS.SIZE,
  BERLIN_PLACEMENT.DEBUG_MARKERS.SIZE,
  BERLIN_PLACEMENT.DEBUG_MARKERS.SIZE,
);

export class BerlinPlacementDebugMarkers {
  private readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private attached = false;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({
        color: BERLIN_PLACEMENT.DEBUG_MARKERS.ACCEPTED_COLOR,
        transparent: true,
        opacity: BERLIN_PLACEMENT.DEBUG_MARKERS.OPACITY,
        depthWrite: false,
      }),
      BERLIN_PLACEMENT.DEBUG_MARKERS.MAX_MARKERS,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.name = "BerlinPlacementDebugMarkers";
    this.group.add(this.mesh);
  }

  public attach(parent: THREE.Object3D): void {
    if (this.attached) {
      return;
    }

    parent.add(this.group);
    this.attached = true;
  }

  public update(points: readonly BerlinAcceptedShadowOriginPoint[]): number {
    const count = Math.min(points.length, BERLIN_PLACEMENT.DEBUG_MARKERS.MAX_MARKERS);

    for (let index = 0; index < count; index += 1) {
      scratchPosition.copy(points[index].worldPosition);
      scratchPosition.y += BERLIN_PLACEMENT.DEBUG_MARKERS.SIZE;
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      this.mesh.setMatrixAt(index, scratchMatrix);
    }

    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return count;
  }

  public dispose(): void {
    if (this.attached) {
      this.group.removeFromParent();
      this.attached = false;
    }

    this.mesh.geometry.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}
