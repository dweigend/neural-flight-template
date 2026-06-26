import type { BerlinConeVolume } from "./types";
import type { TrackedTileMesh } from "./tile-mesh-types";
import { overlapsConeBounds } from "./cone-mesh-bounds";

export interface ConeMeshCandidate {
  cone: BerlinConeVolume;
  mesh: TrackedTileMesh;
}

export function collectConeMeshCandidates(
  cones: readonly BerlinConeVolume[],
  meshes: readonly TrackedTileMesh[],
): readonly ConeMeshCandidate[] {
  if (cones.length === 0) return [];
  if (meshes.length === 0) return [];

  const candidates: ConeMeshCandidate[] = [];

  for (const cone of cones) {
    for (const mesh of meshes) {
      if (!overlapsConeBounds(cone, mesh)) continue;

      candidates.push({ cone, mesh });
    }
  }

  return candidates;
}

export function collectOverlappingConesForMesh(
  cones: readonly BerlinConeVolume[],
  mesh: TrackedTileMesh,
): readonly BerlinConeVolume[] {
  if (cones.length === 0) return [];

  const overlappingCones: BerlinConeVolume[] = [];

  for (const cone of cones) {
    if (!overlapsConeBounds(cone, mesh)) continue;
    overlappingCones.push(cone);
  }

  return overlappingCones;
}
