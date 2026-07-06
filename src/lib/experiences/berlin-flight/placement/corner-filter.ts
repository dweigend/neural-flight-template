import * as THREE from "three";
import { BERLIN_MITTE_ORIGIN } from "../geo/berlin-mitte-origin";
import { localToGeo } from "../geo/coordinates";
import { getBerlinCameraDensitySampler } from "../heatmaps/camera-density-loader";
import { BERLIN_PLACEMENT } from "./config";
import type {
  BerlinAcceptedShadowOriginPoint,
  BerlinRoofCornerCandidate,
} from "./types";

export interface BerlinDensitySampler {
  sampleDensity(lat: number, lon: number): number;
}

export interface BerlinCornerFilterResult {
  stagedCandidates: number;
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[];
  rejectedBySpacing: number;
}

const scratchRepresentativePosition = new THREE.Vector3();

/**
 * Candidate-stage seam for future heatmap density integration.
 *
 * @see heatmap-cone-density-plan.md Phase 3
 */
export function applyBerlinCornerCandidateStage(
  candidates: readonly BerlinRoofCornerCandidate[],
  sampler: BerlinDensitySampler | null = getBerlinCameraDensitySampler(),
): readonly BerlinRoofCornerCandidate[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  if (!sampler) {
    return candidates;
  }

  const candidatesByBuilding = new Map<string, BerlinRoofCornerCandidate[]>();

  for (const candidate of candidates) {
    const buildingCandidates = candidatesByBuilding.get(candidate.buildingId);
    if (buildingCandidates) {
      buildingCandidates.push(candidate);
      continue;
    }

    candidatesByBuilding.set(candidate.buildingId, [candidate]);
  }

  const trimmedCandidates: BerlinRoofCornerCandidate[] = [];

  for (const buildingCandidates of candidatesByBuilding.values()) {
    const allowedCandidateCount = getAllowedCandidateCount(
      sampleBuildingDensity(sampler, buildingCandidates),
    );
    if (allowedCandidateCount === 0) {
      continue;
    }

    if (buildingCandidates.length <= allowedCandidateCount) {
      trimmedCandidates.push(...buildingCandidates);
      continue;
    }

    trimmedCandidates.push(
      ...[...buildingCandidates]
        .sort(compareRoofCornerCandidates)
        .slice(0, allowedCandidateCount),
    );
  }

  return trimmedCandidates;
}

export function filterBerlinRoofCornerCandidates(
  candidates: readonly BerlinRoofCornerCandidate[],
  sampler: BerlinDensitySampler | null = getBerlinCameraDensitySampler(),
): BerlinCornerFilterResult {
  if (candidates.length === 0) {
    return {
      stagedCandidates: 0,
      acceptedPoints: [],
      rejectedBySpacing: 0,
    };
  }

  const stagedCandidates = applyBerlinCornerCandidateStage(candidates, sampler);
  if (stagedCandidates.length === 0) {
    return {
      stagedCandidates: 0,
      acceptedPoints: [],
      rejectedBySpacing: 0,
    };
  }

  const sortedCandidates = [...stagedCandidates].sort(
    compareRoofCornerCandidates,
  );
  const acceptedPoints: BerlinAcceptedShadowOriginPoint[] = [];
  const minDistanceSq =
    BERLIN_PLACEMENT.MIN_REQUIRED_DISTANCE *
    BERLIN_PLACEMENT.MIN_REQUIRED_DISTANCE;
  let rejectedBySpacing = 0;

  for (const candidate of sortedCandidates) {
    if (hasNearbyAcceptedPoint(acceptedPoints, candidate, minDistanceSq)) {
      rejectedBySpacing += 1;
      continue;
    }

    acceptedPoints.push({
      pointId: createShadowOriginPointId(candidate),
      buildingId: candidate.buildingId,
      sourceKey: candidate.sourceKey,
      cornerIndex: candidate.cornerIndex,
      elevation: candidate.elevation,
      worldPosition: candidate.worldPosition.clone(),
    });
  }

  return {
    stagedCandidates: stagedCandidates.length,
    acceptedPoints,
    rejectedBySpacing,
  };
}

function hasNearbyAcceptedPoint(
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[],
  candidate: BerlinRoofCornerCandidate,
  minDistanceSq: number,
): boolean {
  for (const acceptedPoint of acceptedPoints) {
    if (
      acceptedPoint.worldPosition.distanceToSquared(candidate.worldPosition) <=
      minDistanceSq
    ) {
      return true;
    }
  }

  return false;
}

function compareRoofCornerCandidates(
  left: BerlinRoofCornerCandidate,
  right: BerlinRoofCornerCandidate,
): number {
  if (left.elevation !== right.elevation) {
    return right.elevation - left.elevation;
  }

  if (left.buildingId !== right.buildingId) {
    return left.buildingId.localeCompare(right.buildingId);
  }

  if (left.cornerIndex !== right.cornerIndex) {
    return left.cornerIndex - right.cornerIndex;
  }

  if (left.worldPosition.x !== right.worldPosition.x) {
    return left.worldPosition.x - right.worldPosition.x;
  }

  if (left.worldPosition.z !== right.worldPosition.z) {
    return left.worldPosition.z - right.worldPosition.z;
  }

  return left.sourceKey.localeCompare(right.sourceKey);
}

function sampleBuildingDensity(
  sampler: {
    sampleDensity(lat: number, lon: number): number;
  },
  candidates: readonly BerlinRoofCornerCandidate[],
): number {
  getRepresentativePosition(candidates, scratchRepresentativePosition);
  const representativeGeoPoint = localToGeo(BERLIN_MITTE_ORIGIN, {
    x: scratchRepresentativePosition.x,
    y: scratchRepresentativePosition.y,
    z: scratchRepresentativePosition.z,
  });

  return sampler.sampleDensity(representativeGeoPoint.lat, representativeGeoPoint.lon);
}

function getRepresentativePosition(
  candidates: readonly BerlinRoofCornerCandidate[],
  target: THREE.Vector3,
): THREE.Vector3 {
  target.set(0, 0, 0);

  for (const candidate of candidates) {
    target.add(candidate.worldPosition);
  }

  return target.multiplyScalar(1 / candidates.length);
}

export function getAllowedCandidateCount(density: number): number {
  if (density < 0.5) {
    return 1;
  }

  return BERLIN_PLACEMENT.MAX_CORNERS_PER_BUILDING;
}

function createShadowOriginPointId(
  candidate: BerlinRoofCornerCandidate,
): string {
  return `${candidate.buildingId}:${candidate.cornerIndex}`;
}
