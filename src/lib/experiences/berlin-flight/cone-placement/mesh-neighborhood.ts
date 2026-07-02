import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import type { BerlinConeMeshNeighborhood } from "./types";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { updateTrackedMeshWorldSphere } from "../collision/cone-mesh-bounds";
import type { BerlinAcceptedShadowOriginPoint } from "../placement/types";

const scratchSample = new THREE.Vector3();
const scratchDelta = new THREE.Vector3();
const scratchWeightedHorizontal = new THREE.Vector3();

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
  const directionSamples: Array<{
    distanceSq: number;
    horizontal: THREE.Vector3;
  }> = [];

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
      insertDirectionSample(directionSamples, horizontalDistanceSq, scratchDelta);

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

  if (!buildWeightedHorizontalDirection(directionSamples, horizontalDirectionToGeometry)) {
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

function insertDirectionSample(
  directionSamples: Array<{
    distanceSq: number;
    horizontal: THREE.Vector3;
  }>,
  distanceSq: number,
  delta: THREE.Vector3,
): void {
  const limit = BERLIN_CONE_PLACEMENT.MAX_DIRECTION_SAMPLES;
  if (limit <= 0) {
    return;
  }

  const sample = {
    distanceSq,
    horizontal: new THREE.Vector3(delta.x, 0, delta.z),
  };

  let insertIndex = directionSamples.findIndex(
    (candidate) => distanceSq < candidate.distanceSq,
  );
  if (insertIndex === -1) {
    insertIndex = directionSamples.length;
  }

  directionSamples.splice(insertIndex, 0, sample);
  if (directionSamples.length > limit) {
    directionSamples.length = limit;
  }
}

function buildWeightedHorizontalDirection(
  directionSamples: Array<{
    distanceSq: number;
    horizontal: THREE.Vector3;
  }>,
  target: THREE.Vector3,
): boolean {
  scratchWeightedHorizontal.set(0, 0, 0);

  for (const sample of directionSamples) {
    const distance = Math.sqrt(sample.distanceSq);
    if (!Number.isFinite(distance) || distance <= 0) {
      continue;
    }

    scratchWeightedHorizontal.addScaledVector(sample.horizontal, 1 / distance);
  }

  if (scratchWeightedHorizontal.lengthSq() === 0) {
    target.set(0, 0, 0);
    return false;
  }

  target.copy(scratchWeightedHorizontal);
  return true;
}

function updateTrackedMeshWorldPositions(mesh: TrackedTileMesh): void {
  if (
    mesh.worldPositionsInitialized &&
    mesh.cachedVertexWorldMatrix.equals(mesh.mesh.matrixWorld)
  ) {
    return;
  }

  mesh.cachedVertexWorldMatrix.copy(mesh.mesh.matrixWorld);
  mesh.worldPositionsInitialized = true;

  for (let vertexIndex = 0; vertexIndex < mesh.vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    scratchSample.fromArray(mesh.positions, offset);
    scratchSample.applyMatrix4(mesh.cachedVertexWorldMatrix);
    scratchSample.toArray(mesh.worldPositions, offset);
  }
}
