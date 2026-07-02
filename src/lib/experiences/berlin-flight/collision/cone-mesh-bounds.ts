import * as THREE from "three";
import type { BerlinConeVolume } from "./types";
import type { TrackedTileMesh } from "./tile-mesh-types";

const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchConeBoundsCenter = new THREE.Vector3();

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

export function overlapsConeBounds(
  cone: BerlinConeVolume,
  mesh: TrackedTileMesh,
): boolean {
  updateTrackedMeshWorldSphere(mesh);
  scratchConeBoundsCenter
    .copy(cone.tip)
    .addScaledVector(cone.axisDirection, cone.height * 0.5);

  const coneBoundsRadius = Math.hypot(cone.height * 0.5, cone.radius);
  const radiusSum = mesh.worldSphere.radius + coneBoundsRadius;

  return (
    mesh.worldSphere.center.distanceToSquared(scratchConeBoundsCenter) <=
    radiusSum * radiusSum
  );
}
