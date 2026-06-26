import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import type { BerlinConeVolume } from "../collision/types";

const scratchMatrix = new THREE.Matrix4();
const scratchTipPosition = new THREE.Vector3();
const scratchMidpoint = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchTipScale = new THREE.Vector3(
  BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.TIP_SIZE,
  BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.TIP_SIZE,
  BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.TIP_SIZE,
);
const scratchAxisScale = new THREE.Vector3(0.3, 1, 0.3);
const localUpAxis = new THREE.Vector3(0, 1, 0);

export class BerlinConePlacementDebugMarkers {
  private readonly group = new THREE.Group();
  private readonly tipMesh: THREE.InstancedMesh;
  private readonly axisMesh: THREE.InstancedMesh;
  private attached = false;

  constructor() {
    this.tipMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({
        color: BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.TIP_COLOR,
        transparent: true,
        opacity: BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.OPACITY,
        depthWrite: false,
      }),
      BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.MAX_MARKERS,
    );
    this.axisMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.AXIS_COLOR,
        transparent: true,
        opacity: BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.OPACITY,
        depthWrite: false,
      }),
      BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.MAX_MARKERS,
    );
    this.tipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.axisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tipMesh.frustumCulled = false;
    this.axisMesh.frustumCulled = false;
    this.tipMesh.count = 0;
    this.axisMesh.count = 0;
    this.group.name = "BerlinConePlacementDebugMarkers";
    this.group.add(this.tipMesh);
    this.group.add(this.axisMesh);
  }

  public attach(parent: THREE.Object3D): void {
    if (this.attached) return;

    parent.add(this.group);
    this.attached = true;
  }

  public update(cones: readonly BerlinConeVolume[]): number {
    const count = Math.min(
      cones.length,
      BERLIN_CONE_PLACEMENT.DEBUG_MARKERS.MAX_MARKERS,
    );

    for (let index = 0; index < count; index += 1) {
      const cone = cones[index];

      scratchTipPosition.copy(cone.tip);
      scratchMatrix.compose(
        scratchTipPosition,
        scratchQuaternion.identity(),
        scratchTipScale,
      );
      this.tipMesh.setMatrixAt(index, scratchMatrix);

      scratchMidpoint
        .copy(cone.tip)
        .addScaledVector(cone.axisDirection, cone.height * 0.5);
      scratchQuaternion.setFromUnitVectors(localUpAxis, cone.axisDirection);
      scratchAxisScale.set(0.3, cone.height, 0.3);
      scratchMatrix.compose(
        scratchMidpoint,
        scratchQuaternion,
        scratchAxisScale,
      );
      this.axisMesh.setMatrixAt(index, scratchMatrix);
    }

    this.tipMesh.count = count;
    this.axisMesh.count = count;
    this.tipMesh.instanceMatrix.needsUpdate = true;
    this.axisMesh.instanceMatrix.needsUpdate = true;
    return count;
  }

  public dispose(): void {
    if (this.attached) {
      this.group.removeFromParent();
      this.attached = false;
    }

    this.tipMesh.geometry.dispose();
    this.axisMesh.geometry.dispose();
    if (this.tipMesh.material instanceof THREE.Material) {
      this.tipMesh.material.dispose();
    }
    if (this.axisMesh.material instanceof THREE.Material) {
      this.axisMesh.material.dispose();
    }
  }
}
