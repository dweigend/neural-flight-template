import type * as THREE from "three";
import { BERLIN_CONE_GRID } from "../constants";

export type ConeChunkCoordinate = {
  x: number;
  z: number;
};

export function getConeChunkCoordinate(
  position: THREE.Vector3,
): ConeChunkCoordinate {
  const chunkSize =
    BERLIN_CONE_GRID.SPACING * BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;

  return {
    x: Math.floor(position.x / chunkSize),
    z: Math.floor(position.z / chunkSize),
  };
}

export function collectConeChunkKeys(
  center: ConeChunkCoordinate,
  radius: number,
): string[] {
  const chunkKeys: string[] = [];

  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      chunkKeys.push(getConeChunkKey({ x, z }));
    }
  }

  return chunkKeys;
}

export function getConeChunkKey(coordinate: ConeChunkCoordinate): string {
  return `${coordinate.x}:${coordinate.z}`;
}

export function parseConeChunkKey(chunkKey: string): ConeChunkCoordinate {
  const [x, z] = chunkKey.split(":");

  return {
    x: Number(x),
    z: Number(z),
  };
}
