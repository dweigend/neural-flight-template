import type { BerlinRoofCornerCandidate } from "./types";

export function applyBerlinCornerCandidateStage(
  candidates: readonly BerlinRoofCornerCandidate[],
): readonly BerlinRoofCornerCandidate[] {
  if (candidates.length === 0) {
    return candidates;
  }

  return candidates;
}
