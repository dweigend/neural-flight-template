import { BERLIN_PLACEMENT } from "./config";
import type {
  BerlinAcceptedShadowOriginPoint,
  BerlinRoofCornerCandidate,
} from "./types";

export interface BerlinCornerFilterResult {
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[];
  rejectedBySpacing: number;
}

/**
 * Candidate-stage seam for future heatmap density integration.
 *
 * Currently a pass-through — returns candidates unchanged.
 * Phase 3 of the heatmap plan will sample the heatmap here and
 * trim per-building candidate lists based on density before the
 * global spacing filter runs.
 *
 * @see heatmap-cone-density-plan.md Phase 3
 */
export function applyBerlinCornerCandidateStage(
  candidates: readonly BerlinRoofCornerCandidate[],
): readonly BerlinRoofCornerCandidate[] {
  // Phase 3: heatmap density scoring plugs in here.
  return candidates;
}

export function filterBerlinRoofCornerCandidates(
  candidates: readonly BerlinRoofCornerCandidate[],
): BerlinCornerFilterResult {
  if (candidates.length === 0) {
    return {
      acceptedPoints: [],
      rejectedBySpacing: 0,
    };
  }

  const stagedCandidates = applyBerlinCornerCandidateStage(candidates);
  if (stagedCandidates.length === 0) {
    return {
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

function createShadowOriginPointId(
  candidate: BerlinRoofCornerCandidate,
): string {
  return `${candidate.buildingId}:${candidate.cornerIndex}`;
}
