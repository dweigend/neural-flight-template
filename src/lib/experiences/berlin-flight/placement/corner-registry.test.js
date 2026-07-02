// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinCornerRegistry } from "./corner-registry";

function createCandidate(buildingId, cornerIndex, elevation, x, z) {
  return {
    buildingId,
    sourceKey: `${buildingId}:mesh-0`,
    cornerIndex,
    elevation,
    worldPosition: new THREE.Vector3(x, elevation, z),
  };
}

test("BerlinCornerRegistry applies deterministic spacing and prunes stale buildings", () => {
  const registry = new BerlinCornerRegistry();

  registry.updateBuildingCandidates("building-b", [
    createCandidate("building-b", 0, 12, 0, 0),
  ]);
  registry.updateBuildingCandidates("building-a", [
    createCandidate("building-a", 0, 12, 5, 0),
  ]);
  registry.updateBuildingCandidates("building-c", [
    createCandidate("building-c", 0, 20, 30, 0),
  ]);

  const initialSnapshot = registry.getSnapshot();

  expect(initialSnapshot.acceptedPoints.map((point) => point.buildingId)).toEqual([
    "building-c",
    "building-a",
  ]);
  expect(initialSnapshot.counters.rejectedBySpacing).toBe(1);

  registry.pruneToBuildings(["building-a", "building-c"]);

  const prunedSnapshot = registry.getSnapshot();

  expect(prunedSnapshot.acceptedPoints.map((point) => point.buildingId)).toEqual([
    "building-c",
    "building-a",
  ]);
  expect(prunedSnapshot.counters.stalePointsRemoved).toBe(0);

  registry.removeBuilding("building-a");

  const removedSnapshot = registry.getSnapshot();

  expect(removedSnapshot.acceptedPoints.map((point) => point.buildingId)).toEqual([
    "building-c",
  ]);
  expect(removedSnapshot.counters.stalePointsRemoved).toBe(1);
});
