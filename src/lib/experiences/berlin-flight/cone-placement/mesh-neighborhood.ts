import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import type { BerlinConeMeshNeighborhood } from "./types";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { updateTrackedMeshWorldSphere } from "../collision/cone-mesh-bounds";
import type { BerlinAcceptedShadowOriginPoint } from "../placement/types";

const scratchSample = new THREE.Vector3();
const scratchDelta = new THREE.Vector3();

export function sampleBerlinMeshNeighborhood(
  point: BerlinAcceptedShadowOriginPoint,
  trackedMeshes: readonly TrackedTileMesh[],
): BerlinConeMeshNeighborhood | null {
  const searchRadius = BERLIN_CONE_PLACEMENT.NEIGHBORHOOD_SEARCH_RADIUS;
  const searchRadiusSq = searchRadius * searchRadius;
  const clearanceSq =
    BERLIN_CONE_PLACEMENT.ROOF_CLEARANCE_EPSILON *
    BERLIN_CONE_PLACEMENT.ROOF_CLEARANCE_EPSILON;

  let sampleCount = 0;
  let contributingMeshCount = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  let farthestDistanceSq = 0;
  let foundMeshSample = false;
  const nearestWorldPoint = new THREE.Vector3();
  const directionToGeometry = new THREE.Vector3();
  const horizontalDirectionToGeometry = new THREE.Vector3();

  for (const trackedMesh of trackedMeshes) {
    updateTrackedMeshWorldSphere(trackedMesh);

    const maxDistance = searchRadius + trackedMesh.worldSphere.radius;
    if (
      trackedMesh.worldSphere.center.distanceToSquared(point.worldPosition) >
      maxDistance * maxDistance
    ) {
      continue;
    }

    updateTrackedMeshWorldPositions(trackedMesh);

    foundMeshSample = false;

    for (let vertexIndex = 0; vertexIndex < trackedMesh.vertexCount; vertexIndex += 1) {
      const offset = vertexIndex * 3;
      scratchSample.fromArray(trackedMesh.worldPositions, offset);
      scratchDelta.subVectors(scratchSample, point.worldPosition);

      const distanceSq = scratchDelta.lengthSq();
      if (distanceSq > searchRadiusSq || distanceSq <= clearanceSq) {
        continue;
      }

      const horizontalDistanceSq =
        scratchDelta.x * scratchDelta.x + scratchDelta.z * scratchDelta.z;
      if (horizontalDistanceSq <= clearanceSq) {
        continue;
      }

      sampleCount += 1;
      foundMeshSample = true;

      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestWorldPoint.copy(scratchSample);
        directionToGeometry.copy(scratchDelta);
        horizontalDirectionToGeometry.set(scratchDelta.x, 0, scratchDelta.z);
      }

      if (distanceSq > farthestDistanceSq) {
        farthestDistanceSq = distanceSq;
      }
    }

    if (foundMeshSample) {
      contributingMeshCount += 1;
    }
  }

  if (sampleCount < BERLIN_CONE_PLACEMENT.MIN_NEARBY_SAMPLE_COUNT) {
    return null;
  }

  if (!Number.isFinite(nearestDistanceSq)) {
    return null;
  }

  return {
    nearestWorldPoint,
    directionToGeometry,
    horizontalDirectionToGeometry,
    sampleCount,
    contributingMeshCount,
    nearestDistance: Math.sqrt(nearestDistanceSq),
    farthestDistance: Math.sqrt(farthestDistanceSq),
  };
}

function updateTrackedMeshWorldPositions(mesh: TrackedTileMesh): void {
  if (mesh.cachedVertexWorldMatrix.equals(mesh.mesh.matrixWorld)) return;

  mesh.cachedVertexWorldMatrix.copy(mesh.mesh.matrixWorld);

  for (let vertexIndex = 0; vertexIndex < mesh.vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    scratchSample.fromArray(mesh.positions, offset);
    scratchSample.applyMatrix4(mesh.cachedVertexWorldMatrix);
    scratchSample.toArray(mesh.worldPositions, offset);
  }
}
