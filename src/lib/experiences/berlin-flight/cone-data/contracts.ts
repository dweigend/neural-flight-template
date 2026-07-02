import type { BerlinConeChunkKey } from "../runtime/cone-grid-coordinates";
import { BERLIN_CONE_CHUNK_SIZE_METERS } from "../runtime/cone-grid-coordinates";

export interface BerlinConeDatasetManifest {
  version: number;
  origin: {
    x: number;
    z: number;
  };
  chunkSizeMeters: number;
  bounds: {
    minChunkX: number;
    maxChunkX: number;
    minChunkZ: number;
    maxChunkZ: number;
  };
  chunkCount: number;
}

/**
 * Flat runtime payload for a single world-space chunk of precomputed cones.
 * `tileUrl` is intentionally absent: chunk identity is stable local Berlin space.
 */
export interface BerlinConeChunkData {
  chunkKey: BerlinConeChunkKey;
  chunkWorldMinX: number;
  chunkWorldMinZ: number;
  chunkSizeMeters: number;
  positions: Float32Array;
  scalars: Float32Array;
  coneIndex: Int32Array;
}

export function createEmptyBerlinConeDatasetManifest(): BerlinConeDatasetManifest {
  return {
    version: 1,
    origin: {
      x: 0,
      z: 0,
    },
    chunkSizeMeters: BERLIN_CONE_CHUNK_SIZE_METERS,
    bounds: {
      minChunkX: 0,
      maxChunkX: -1,
      minChunkZ: 0,
      maxChunkZ: -1,
    },
    chunkCount: 0,
  };
}
