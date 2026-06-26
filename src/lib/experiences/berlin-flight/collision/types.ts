import type * as THREE from "three";

export interface BerlinConeVolume {
  /** Canonical cone anchor. `baseCenter` is derived from `tip + axisDirection * height`. */
  tip: THREE.Vector3;
  axisDirection: THREE.Vector3;
  radius: number;
  height: number;
  baseCenter: THREE.Vector3;
  placementPointId: string;
  sourceBuildingId: string;
  chunkKey: string;
  coneIndex: number;
}

export interface BerlinConeChunkSnapshot {
  key: string;
  cones: readonly BerlinConeVolume[];
}
