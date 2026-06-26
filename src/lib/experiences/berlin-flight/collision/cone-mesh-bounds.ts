import * as THREE from "three";
import type { BerlinConeVolume } from "./types";
import type { TrackedTileMesh } from "./tile-mesh-types";

const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();

export function updateTrackedMeshWorldSphere(mesh: TrackedTileMesh): void {
  if (mesh.cachedBoundsMatrix.equals(mesh.mesh.matrixWorld)) return;

  mesh.cachedBoundsMatrix.copy(mesh.mesh.matrixWorld);
  mesh.cachedBoundsMatrix.decompose(
    scratchPosition,
    scratchQuaternion,
    scratchScale,
  );

  mesh.worldSphere.center
    .copy(mesh.localSphere.center)
    .applyMatrix4(mesh.cachedBoundsMatrix);
  mesh.worldSphere.radius =
    mesh.localSphere.radius *
    Math.max(scratchScale.x, scratchScale.y, scratchScale.z);
}

export function overlapsConeCylinderBounds(
  cone: BerlinConeVolume,
  mesh: TrackedTileMesh,
): boolean {
  updateTrackedMeshWorldSphere(mesh);

  const deltaX = mesh.worldSphere.center.x - cone.baseCenter.x;
  const deltaZ = mesh.worldSphere.center.z - cone.baseCenter.z;
  const radiusSum = mesh.worldSphere.radius + cone.radius;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  if (distanceSq > radiusSum * radiusSum) {
    return false;
  }

  const sphereMinY = mesh.worldSphere.center.y - mesh.worldSphere.radius;
  const sphereMaxY = mesh.worldSphere.center.y + mesh.worldSphere.radius;
  const coneMinY = cone.baseCenter.y;
  const coneMaxY = cone.tip.y;

  if (sphereMaxY < coneMinY) return false;
  if (sphereMinY > coneMaxY) return false;

  return true;
}
