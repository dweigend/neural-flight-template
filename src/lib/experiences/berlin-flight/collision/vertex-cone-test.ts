import * as THREE from "three";
import type { BerlinConeVolume } from "./types";

const scratchTipToPosition = new THREE.Vector3();
const scratchRadialVector = new THREE.Vector3();

export function isVertexInsideCone(
  position: THREE.Vector3,
  cone: BerlinConeVolume,
): boolean {
  scratchTipToPosition.subVectors(position, cone.tip);

  const projectedDistance = scratchTipToPosition.dot(cone.axisDirection);
  if (projectedDistance < 0 || projectedDistance > cone.height) {
    return false;
  }

  scratchRadialVector
    .copy(cone.axisDirection)
    .multiplyScalar(projectedDistance);
  scratchRadialVector.sub(scratchTipToPosition);

  const allowedRadius = cone.radius * (projectedDistance / cone.height);
  return scratchRadialVector.lengthSq() <= allowedRadius * allowedRadius;
}
