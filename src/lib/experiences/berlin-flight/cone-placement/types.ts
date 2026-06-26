import type * as THREE from "three";
import type { BerlinConeVolume } from "../collision/types";

export interface BerlinConeMeshNeighborhood {
  nearestWorldPoint: THREE.Vector3;
  directionToGeometry: THREE.Vector3;
  horizontalDirectionToGeometry: THREE.Vector3;
  sampleCount: number;
  contributingMeshCount: number;
  nearestDistance: number;
  farthestDistance: number;
}

export interface BerlinConePlacementDebugCounters {
  acceptedPoints: number;
  activeCones: number;
  pendingPoints: number;
  processedPoints: number;
  skippedMissingNeighborhood: number;
  skippedAmbiguousDirection: number;
}

export interface BerlinConePlacementDebugSnapshot {
  counters: BerlinConePlacementDebugCounters;
  lastUpdateDurationMs: number;
  activeCones: readonly BerlinConeVolume[];
}
