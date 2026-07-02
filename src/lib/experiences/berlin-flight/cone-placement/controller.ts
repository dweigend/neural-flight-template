import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import { BerlinConePlacementDebugMarkers } from "./debug-markers";
import { sampleBerlinMeshNeighborhood } from "./mesh-neighborhood";
import { solveBerlinConeAxisDirection } from "./orientation-solver";
import { createBerlinConeVolume } from "./cone-volume";
import type {
  BerlinConePlacementDebugSnapshot,
  BerlinConePlacementDebugCounters,
} from "./types";
import type { BerlinConeVolume } from "../collision/types";
import { BERLIN_CONE_GRID } from "../runtime/cone-grid-config";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import type { BerlinAcceptedShadowOriginPoint } from "../placement/types";

export class BerlinConePlacementController {
  private readonly conesByPointId = new Map<string, BerlinConeVolume>();
  private readonly pointsByPointId = new Map<
    string,
    BerlinAcceptedShadowOriginPoint
  >();
  private activeCones: readonly BerlinConeVolume[] = [];
  private pendingPointIds: string[] = [];
  private lastAcceptedPointsSignature = "";
  private trackedMeshVersion = -1;
  private snapshotVersion = 0;
  private lastUpdateDurationMs = 0;
  private debugMarkers: BerlinConePlacementDebugMarkers | null = null;
  private lastCounters: BerlinConePlacementDebugCounters = {
    acceptedPoints: 0,
    activeCones: 0,
    pendingPoints: 0,
    processedPoints: 0,
    skippedMissingNeighborhood: 0,
    skippedAmbiguousDirection: 0,
    activeDebugMarkerCount: 0,
  };

  public update(
    acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[],
    trackedMeshes: readonly TrackedTileMesh[],
    trackedMeshVersion: number,
  ): void {
    const startedAt = performance.now();
    const acceptedPointsSignature = createAcceptedPointsSignature(acceptedPoints);
    const pointsChanged =
      acceptedPointsSignature !== this.lastAcceptedPointsSignature;
    const meshesChanged = trackedMeshVersion !== this.trackedMeshVersion;

    this.syncAcceptedPoints(acceptedPoints);

    if (pointsChanged) {
      this.pendingPointIds = acceptedPoints.map((point) => point.pointId);
      this.lastAcceptedPointsSignature = acceptedPointsSignature;
    } else if (meshesChanged) {
      this.pendingPointIds = mergePendingPointIds(
        this.pendingPointIds,
        acceptedPoints.filter(
          (point) => !this.conesByPointId.has(point.pointId),
        ),
      );
    }
    this.trackedMeshVersion = trackedMeshVersion;

    let processedPoints = 0;
    let skippedMissingNeighborhood = 0;
    let skippedAmbiguousDirection = 0;
    let activeConesChanged = false;

    while (
      processedPoints < BERLIN_CONE_PLACEMENT.MAX_CONES_PER_TICK &&
      this.pendingPointIds.length > 0
    ) {
      const pointId = this.pendingPointIds.shift();
      if (!pointId) {
        break;
      }

      const point = this.pointsByPointId.get(pointId);
      if (!point) {
        continue;
      }

      const neighborhood = sampleBerlinMeshNeighborhood(point, trackedMeshes);
      if (!neighborhood) {
        skippedMissingNeighborhood += 1;
        activeConesChanged =
          this.conesByPointId.delete(point.pointId) || activeConesChanged;
        processedPoints += 1;
        continue;
      }

      const axisDirection = solveBerlinConeAxisDirection(point, neighborhood);
      if (!axisDirection) {
        skippedAmbiguousDirection += 1;
        activeConesChanged =
          this.conesByPointId.delete(point.pointId) || activeConesChanged;
        processedPoints += 1;
        continue;
      }

      const nextCone = createBerlinConeVolume(point, axisDirection);
      const previousCone = this.conesByPointId.get(point.pointId);

      if (!areConeVolumesEqual(previousCone, nextCone)) {
        this.conesByPointId.set(point.pointId, nextCone);
        activeConesChanged = true;
      }

      processedPoints += 1;
    }

    if (activeConesChanged) {
      this.activeCones = Array.from(this.conesByPointId.values()).sort(
        compareConeVolumes,
      );
      this.snapshotVersion += 1;
    }

    const activeDebugMarkerCount = this.debugMarkers
      ? this.debugMarkers.update(this.activeCones)
      : 0;

    this.lastCounters = {
      acceptedPoints: acceptedPoints.length,
      activeCones: this.activeCones.length,
      pendingPoints: this.pendingPointIds.length,
      processedPoints,
      skippedMissingNeighborhood,
      skippedAmbiguousDirection,
      activeDebugMarkerCount,
    };
    this.lastUpdateDurationMs = performance.now() - startedAt;
  }

  public setDebugEnabled(parent: THREE.Object3D, enabled: boolean): void {
    if (!enabled) {
      this.debugMarkers?.dispose();
      this.debugMarkers = null;
      this.lastCounters = {
        ...this.lastCounters,
        activeDebugMarkerCount: 0,
      };
      return;
    }

    if (this.debugMarkers) {
      return;
    }

    this.debugMarkers = new BerlinConePlacementDebugMarkers();
    this.debugMarkers.attach(parent);
    this.lastCounters = {
      ...this.lastCounters,
      activeDebugMarkerCount: this.debugMarkers.update(this.activeCones),
    };
  }

  public getActiveCones(): readonly BerlinConeVolume[] {
    return this.activeCones;
  }

  public getSnapshotVersion(): number {
    return this.snapshotVersion;
  }

  public getSnapshot(): BerlinConePlacementDebugSnapshot {
    return {
      counters: this.lastCounters,
      lastUpdateDurationMs: this.lastUpdateDurationMs,
      activeCones: this.activeCones,
    };
  }

  public dispose(): void {
    this.conesByPointId.clear();
    this.pointsByPointId.clear();
    this.activeCones = [];
    this.pendingPointIds = [];
    this.lastAcceptedPointsSignature = "";
    this.trackedMeshVersion = -1;
    this.snapshotVersion = 0;
    this.lastUpdateDurationMs = 0;
    this.debugMarkers?.dispose();
    this.debugMarkers = null;
    this.lastCounters = {
      acceptedPoints: 0,
      activeCones: 0,
      pendingPoints: 0,
      processedPoints: 0,
      skippedMissingNeighborhood: 0,
      skippedAmbiguousDirection: 0,
      activeDebugMarkerCount: 0,
    };
  }

  private syncAcceptedPoints(
    acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[],
  ): void {
    const nextPointIds = new Set(acceptedPoints.map((point) => point.pointId));
    let activeConesChanged = false;

    for (const point of acceptedPoints) {
      this.pointsByPointId.set(point.pointId, point);
    }

    for (const pointId of this.pointsByPointId.keys()) {
      if (nextPointIds.has(pointId)) {
        continue;
      }

      this.pointsByPointId.delete(pointId);
      activeConesChanged = this.conesByPointId.delete(pointId) || activeConesChanged;
    }

    if (activeConesChanged) {
      this.activeCones = Array.from(this.conesByPointId.values()).sort(
        compareConeVolumes,
      );
      this.snapshotVersion += 1;
    }
  }
}

function createAcceptedPointsSignature(
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[],
): string {
  return acceptedPoints.map(createAcceptedPointSignature).join("|");
}

function createAcceptedPointSignature(
  point: BerlinAcceptedShadowOriginPoint,
): string {
  return [
    point.pointId,
    quantize(point.worldPosition.x),
    quantize(point.worldPosition.y),
    quantize(point.worldPosition.z),
  ].join(":");
}

function quantize(value: number): string {
  return Math.round(value * 100).toString();
}

function mergePendingPointIds(
  pendingPointIds: readonly string[],
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[],
): string[] {
  const pendingPointIdSet = new Set(pendingPointIds);
  const mergedPointIds = [...pendingPointIds];

  for (const point of acceptedPoints) {
    if (pendingPointIdSet.has(point.pointId)) {
      continue;
    }

    mergedPointIds.push(point.pointId);
    pendingPointIdSet.add(point.pointId);
  }

  return mergedPointIds;
}

function compareConeVolumes(
  left: BerlinConeVolume,
  right: BerlinConeVolume,
): number {
  return left.placementPointId.localeCompare(right.placementPointId);
}

function areConeVolumesEqual(
  left: BerlinConeVolume | undefined,
  right: BerlinConeVolume,
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.tip.equals(right.tip) &&
    left.axisDirection.equals(right.axisDirection) &&
    left.baseCenter.equals(right.baseCenter) &&
    left.height === right.height &&
    left.radius === right.radius &&
    left.placementPointId === right.placementPointId &&
    left.sourceBuildingId === right.sourceBuildingId &&
    left.chunkKey === right.chunkKey &&
    left.coneIndex === right.coneIndex
  );
}
