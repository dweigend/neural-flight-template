import type * as THREE from "three";

export interface BerlinConeVolume {
  center: THREE.Vector3;
  radius: number;
  height: number;
  chunkKey: string;
  coneIndex: number;
}

export interface BerlinConeChunkSnapshot {
  key: string;
  cones: readonly BerlinConeVolume[];
}
