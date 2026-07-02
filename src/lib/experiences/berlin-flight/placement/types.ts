import type * as THREE from "three";
import type { BerlinTileMesh } from "../collision/tile-mesh-types";

export interface BerlinPlacementBuildingMetadata {
  osmId: string | null;
  featureId: string | null;
  sourceLayer: string | null;
}

export interface BerlinPlacementBuildingSource {
  buildingId: string;
  sourceKey: string;
  mesh: BerlinTileMesh;
  geometry: THREE.BufferGeometry;
  metadata: BerlinPlacementBuildingMetadata;
}

export interface BerlinRoofCornerCandidate {
  buildingId: string;
  sourceKey: string;
  cornerIndex: number;
  elevation: number;
  worldPosition: THREE.Vector3;
}

export interface BerlinAcceptedShadowOriginPoint {
  pointId: string;
  buildingId: string;
  sourceKey: string;
  cornerIndex: number;
  elevation: number;
  worldPosition: THREE.Vector3;
}

export interface BerlinPlacementDebugCounters {
  scannedBuildings: number;
  scannedCandidates: number;
  acceptedPoints: number;
  rejectedBySpacing: number;
  stalePointsRemoved: number;
  activeDebugMarkerCount: number;
}

export interface BerlinPlacementDebugSnapshot {
  counters: BerlinPlacementDebugCounters;
  lastUpdateDurationMs: number;
  acceptedPoints: readonly BerlinAcceptedShadowOriginPoint[];
}
