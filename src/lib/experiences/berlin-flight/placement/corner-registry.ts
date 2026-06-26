import {
  filterBerlinRoofCornerCandidates,
  type BerlinCornerFilterResult,
} from "./corner-filter";
import type {
  BerlinAcceptedShadowOriginPoint,
  BerlinPlacementDebugSnapshot,
  BerlinRoofCornerCandidate,
} from "./types";

export class BerlinCornerRegistry {
  private readonly candidatesByBuilding = new Map<
    string,
    readonly BerlinRoofCornerCandidate[]
  >();
  private acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[] = [];
  private dirty = false;
  private scannedCandidates = 0;
  private rejectedBySpacing = 0;
  private stalePointsRemoved = 0;

  public updateBuildingCandidates(
    buildingId: string,
    candidates: readonly BerlinRoofCornerCandidate[],
  ): void {
    const nextCandidates = [...candidates];
    const previousCandidates = this.candidatesByBuilding.get(buildingId);
    if (hasSameCandidates(previousCandidates, nextCandidates)) {
      return;
    }

    this.candidatesByBuilding.set(buildingId, nextCandidates);
    this.dirty = true;
  }

  public removeBuilding(buildingId: string): void {
    if (!this.candidatesByBuilding.delete(buildingId)) {
      return;
    }

    this.dirty = true;
  }

  public pruneToBuildings(activeBuildingIds: readonly string[]): void {
    const activeIds = new Set(activeBuildingIds);

    for (const buildingId of this.candidatesByBuilding.keys()) {
      if (activeIds.has(buildingId)) {
        continue;
      }

      this.candidatesByBuilding.delete(buildingId);
      this.dirty = true;
    }
  }

  public getAcceptedPoints(): readonly BerlinAcceptedShadowOriginPoint[] {
    this.refreshAcceptedPoints();
    return this.acceptedPoints;
  }

  public getSnapshot(): BerlinPlacementDebugSnapshot {
    this.refreshAcceptedPoints();
    return {
      counters: {
        scannedBuildings: this.candidatesByBuilding.size,
        scannedCandidates: this.scannedCandidates,
        acceptedPoints: this.acceptedPoints.length,
        rejectedBySpacing: this.rejectedBySpacing,
        stalePointsRemoved: this.stalePointsRemoved,
        activeDebugMarkerCount: 0,
      },
      lastUpdateDurationMs: 0,
      acceptedPoints: this.acceptedPoints,
    };
  }

  public clear(): void {
    if (this.candidatesByBuilding.size === 0 && this.acceptedPoints.length === 0) {
      return;
    }

    this.candidatesByBuilding.clear();
    this.acceptedPoints = [];
    this.scannedCandidates = 0;
    this.rejectedBySpacing = 0;
    this.stalePointsRemoved = 0;
    this.dirty = false;
  }

  private refreshAcceptedPoints(): void {
    if (!this.dirty) {
      return;
    }

    const previousPointIds = new Set(this.acceptedPoints.map((point) => point.pointId));
    const allCandidates = Array.from(this.candidatesByBuilding.values()).flat();
    const filterResult = filterBerlinRoofCornerCandidates(allCandidates);

    this.acceptedPoints = filterResult.acceptedPoints;
    this.scannedCandidates = allCandidates.length;
    this.rejectedBySpacing = filterResult.rejectedBySpacing;
    this.stalePointsRemoved = countRemovedPoints(
      previousPointIds,
      filterResult,
    );
    this.dirty = false;
  }
}

function hasSameCandidates(
  left: readonly BerlinRoofCornerCandidate[] | undefined,
  right: readonly BerlinRoofCornerCandidate[],
): boolean {
  if (!left) {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftCandidate = left[index];
    const rightCandidate = right[index];

    if (
      leftCandidate.cornerIndex !== rightCandidate.cornerIndex ||
      leftCandidate.elevation !== rightCandidate.elevation ||
      !leftCandidate.worldPosition.equals(rightCandidate.worldPosition)
    ) {
      return false;
    }
  }

  return true;
}

function countRemovedPoints(
  previousPointIds: ReadonlySet<string>,
  filterResult: BerlinCornerFilterResult,
): number {
  if (previousPointIds.size === 0) {
    return 0;
  }

  const nextPointIds = new Set(filterResult.acceptedPoints.map((point) => point.pointId));
  let removedPoints = 0;

  for (const previousPointId of previousPointIds) {
    if (nextPointIds.has(previousPointId)) {
      continue;
    }

    removedPoints += 1;
  }

  return removedPoints;
}
