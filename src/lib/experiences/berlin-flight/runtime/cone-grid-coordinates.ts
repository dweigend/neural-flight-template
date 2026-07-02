import type * as THREE from "three";
import { BERLIN_CONE_GRID } from "./cone-grid-config";

export type BerlinConeChunkKey = `${number}:${number}`;

export type ConeChunkCoordinate = {
  x: number;
  z: number;
};

export type ConeGridCoordinate = {
  x: number;
  z: number;
};

/**
 * Offline cone data is keyed in stable Berlin-local world space, never by tile URL.
 * Keep this shared with runtime so the dataset builder and loader cannot drift.
 */
export const BERLIN_CONE_CHUNK_SIZE_METERS =
  BERLIN_CONE_GRID.SPACING * BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;

export function getConeGridCoordinate(
  position: THREE.Vector3,
): ConeGridCoordinate {
  return {
    x: Math.floor(position.x / BERLIN_CONE_GRID.SPACING),
    z: Math.floor(position.z / BERLIN_CONE_GRID.SPACING),
  };
}

export function getConeChunkCoordinate(
  position: THREE.Vector3,
): ConeChunkCoordinate {
  return {
    x: Math.floor(position.x / BERLIN_CONE_CHUNK_SIZE_METERS),
    z: Math.floor(position.z / BERLIN_CONE_CHUNK_SIZE_METERS),
  };
}

export function collectConeChunkKeys(
  center: ConeChunkCoordinate,
  radius: number,
): BerlinConeChunkKey[] {
  const chunkKeys: BerlinConeChunkKey[] = [];

  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      chunkKeys.push(getConeChunkKey({ x, z }));
    }
  }

  return chunkKeys;
}

export function getConeChunkKey(
  coordinate: ConeChunkCoordinate,
): BerlinConeChunkKey {
  return `${coordinate.x}:${coordinate.z}` as BerlinConeChunkKey;
}

export function getConeGridKey(coordinate: ConeGridCoordinate): string {
  return `${coordinate.x}:${coordinate.z}`;
}

export function parseConeChunkKey(
  chunkKey: BerlinConeChunkKey | string,
): ConeChunkCoordinate {
  const [x, z] = chunkKey.split(":");

  return {
    x: Number(x),
    z: Number(z),
  };
}
