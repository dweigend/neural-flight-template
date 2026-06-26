import * as THREE from "three";
import { BERLIN_PLACEMENT } from "./config";
import { extractBerlinRoofCornerCandidates } from "./corner-extractor";
import { BerlinCornerRegistry } from "./corner-registry";
import { BerlinPlacementDebugMarkers } from "./debug-markers";
import { collectNearbyBerlinBuildingSources } from "./osm-corner-source";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import type {
  BerlinAcceptedShadowOriginPoint,
  BerlinPlacementDebugSnapshot,
  BerlinPlacementBuildingSource,
} from "./types";

export class BerlinPlacementController {
  private readonly registry = new BerlinCornerRegistry();
  private readonly lastPlayerPosition = new THREE.Vector3(Number.NaN, 0, 0);
  private pendingSources: readonly BerlinPlacementBuildingSource[] = [];
  private debugMarkers: BerlinPlacementDebugMarkers | null = null;
  private nextSourceIndex = 0;
  private trackedMeshVersion = -1;
  private activeDebugMarkerCount = 0;
  private lastUpdateDurationMs = 0;

  public update(
    playerPosition: THREE.Vector3,
    trackedMeshes: readonly TrackedTileMesh[],
    trackedMeshVersion: number,
  ): void {
    const startedAt = performance.now();

    if (shouldRescanSources(
      this.lastPlayerPosition,
      playerPosition,
      this.trackedMeshVersion,
      trackedMeshVersion,
    )) {
      this.rebuildPendingSources(playerPosition, trackedMeshes, trackedMeshVersion);
    }

    if (this.nextSourceIndex < this.pendingSources.length) {
      this.processPendingSources();
    }

    if (this.debugMarkers) {
      this.activeDebugMarkerCount = this.debugMarkers.update(
        this.registry.getAcceptedPoints(),
      );
    }

    this.lastUpdateDurationMs = performance.now() - startedAt;
  }

  public setDebugEnabled(parent: THREE.Object3D, enabled: boolean): void {
    if (!enabled) {
      this.debugMarkers?.dispose();
      this.debugMarkers = null;
      this.activeDebugMarkerCount = 0;
      return;
    }

    if (this.debugMarkers) {
      return;
    }

    this.debugMarkers = new BerlinPlacementDebugMarkers();
    this.debugMarkers.attach(parent);
    this.activeDebugMarkerCount = this.debugMarkers.update(
      this.registry.getAcceptedPoints(),
    );
  }

  public getAcceptedPoints(): readonly BerlinAcceptedShadowOriginPoint[] {
    return this.registry.getAcceptedPoints();
  }

  public getSnapshot(): BerlinPlacementDebugSnapshot {
    const snapshot = this.registry.getSnapshot();
    return {
      counters: {
        ...snapshot.counters,
        activeDebugMarkerCount: this.activeDebugMarkerCount,
      },
      lastUpdateDurationMs: this.lastUpdateDurationMs,
      acceptedPoints: snapshot.acceptedPoints,
    };
  }

  public dispose(): void {
    this.pendingSources = [];
    this.nextSourceIndex = 0;
    this.trackedMeshVersion = -1;
    this.activeDebugMarkerCount = 0;
    this.lastUpdateDurationMs = 0;
    this.debugMarkers?.dispose();
    this.debugMarkers = null;
    this.registry.clear();
  }

  private rebuildPendingSources(
    playerPosition: THREE.Vector3,
    trackedMeshes: readonly TrackedTileMesh[],
    trackedMeshVersion: number,
  ): void {
    this.pendingSources = collectNearbyBerlinBuildingSources(
      trackedMeshes,
      playerPosition,
    );
    this.nextSourceIndex = 0;
    this.trackedMeshVersion = trackedMeshVersion;
    this.lastPlayerPosition.copy(playerPosition);
    this.registry.pruneToBuildings(
      this.pendingSources.map((source) => source.buildingId),
    );
  }

  private processPendingSources(): void {
    let processedBuildings = 0;
    let processedCandidates = 0;

    while (this.nextSourceIndex < this.pendingSources.length) {
      if (processedBuildings >= BERLIN_PLACEMENT.MAX_BUILDINGS_PER_TICK) {
        return;
      }

      if (processedCandidates >= BERLIN_PLACEMENT.MAX_CANDIDATES_PER_TICK) {
        return;
      }

      const source = this.pendingSources[this.nextSourceIndex];
      const candidates = extractBerlinRoofCornerCandidates(source);
      this.registry.updateBuildingCandidates(source.buildingId, candidates);
      this.nextSourceIndex += 1;
      processedBuildings += 1;
      processedCandidates += candidates.length;
    }
  }
}

function shouldRescanSources(
  lastPlayerPosition: THREE.Vector3,
  playerPosition: THREE.Vector3,
  previousVersion: number,
  nextVersion: number,
): boolean {
  if (previousVersion !== nextVersion) {
    return true;
  }

  if (Number.isNaN(lastPlayerPosition.x)) {
    return true;
  }

  return (
    lastPlayerPosition.distanceToSquared(playerPosition) >=
    BERLIN_PLACEMENT.RECOMPUTE_MOVEMENT_THRESHOLD *
      BERLIN_PLACEMENT.RECOMPUTE_MOVEMENT_THRESHOLD
  );
}
