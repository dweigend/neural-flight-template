import * as THREE from "three";
import { BERLIN_PLACEMENT } from "./config";
import type {
  BerlinPlacementBuildingSource,
  BerlinRoofCornerCandidate,
} from "./types";

const scratchPosition = new THREE.Vector3();

export function extractBerlinRoofCornerCandidates(
  source: BerlinPlacementBuildingSource,
): readonly BerlinRoofCornerCandidate[] {
  const positionAttribute = source.geometry.getAttribute("position");
  if (!(positionAttribute instanceof THREE.BufferAttribute)) {
    return [];
  }

  if (positionAttribute.itemSize < 3) {
    return [];
  }

  const vertexCount = positionAttribute.count;
  if (vertexCount === 0) {
    return [];
  }

  source.mesh.updateMatrixWorld(true);

  let maxElevation = Number.NEGATIVE_INFINITY;

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    scratchPosition
      .fromBufferAttribute(positionAttribute, vertexIndex)
      .applyMatrix4(source.mesh.matrixWorld);

    if (scratchPosition.y > maxElevation) {
      maxElevation = scratchPosition.y;
    }
  }

  if (!Number.isFinite(maxElevation)) {
    return [];
  }

  const roofElevationThreshold =
    maxElevation - BERLIN_PLACEMENT.ROOF_ELEVATION_EPSILON;
  const dedupeDistanceSq =
    BERLIN_PLACEMENT.SAME_BUILDING_DEDUPE_EPSILON *
    BERLIN_PLACEMENT.SAME_BUILDING_DEDUPE_EPSILON;
  const candidates: BerlinRoofCornerCandidate[] = [];

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    scratchPosition
      .fromBufferAttribute(positionAttribute, vertexIndex)
      .applyMatrix4(source.mesh.matrixWorld);

    if (scratchPosition.y < roofElevationThreshold) {
      continue;
    }

    if (hasNearbyCandidate(candidates, scratchPosition, dedupeDistanceSq)) {
      continue;
    }

    candidates.push({
      buildingId: source.buildingId,
      sourceKey: source.sourceKey,
      cornerIndex: vertexIndex,
      elevation: scratchPosition.y,
      worldPosition: scratchPosition.clone(),
    });
  }

  if (candidates.length <= 1) {
    return candidates;
  }

  candidates.sort(compareCornerCandidates);
  if (candidates.length <= BERLIN_PLACEMENT.MAX_CORNERS_PER_BUILDING) {
    return candidates;
  }

  return candidates.slice(0, BERLIN_PLACEMENT.MAX_CORNERS_PER_BUILDING);
}

function hasNearbyCandidate(
  candidates: readonly BerlinRoofCornerCandidate[],
  position: THREE.Vector3,
  maxDistanceSq: number,
): boolean {
  for (const candidate of candidates) {
    if (candidate.worldPosition.distanceToSquared(position) <= maxDistanceSq) {
      return true;
    }
  }

  return false;
}

function compareCornerCandidates(
  left: BerlinRoofCornerCandidate,
  right: BerlinRoofCornerCandidate,
): number {
  if (left.elevation !== right.elevation) {
    return right.elevation - left.elevation;
  }

  if (left.worldPosition.x !== right.worldPosition.x) {
    return left.worldPosition.x - right.worldPosition.x;
  }

  if (left.worldPosition.z !== right.worldPosition.z) {
    return left.worldPosition.z - right.worldPosition.z;
  }

  return left.cornerIndex - right.cornerIndex;
}
