import type {
  BerlinConeChunkSnapshot,
  BerlinConeVolume,
} from "../collision/types";

export type ActiveConeChunkSnapshotSource = {
  key: string;
  cones: readonly BerlinConeVolume[];
};

export function buildConeSnapshotState(
  activeChunks: Iterable<ActiveConeChunkSnapshotSource>,
): {
  chunkSnapshots: readonly BerlinConeChunkSnapshot[];
  coneVolumes: readonly BerlinConeVolume[];
} {
  const chunkSnapshots: BerlinConeChunkSnapshot[] = [];
  const coneVolumes: BerlinConeVolume[] = [];

  for (const chunk of activeChunks) {
    chunkSnapshots.push({
      key: chunk.key,
      cones: chunk.cones,
    });
    coneVolumes.push(...chunk.cones);
  }

  return {
    chunkSnapshots,
    coneVolumes,
  };
}
