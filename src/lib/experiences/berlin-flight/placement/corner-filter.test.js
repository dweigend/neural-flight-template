// @ts-nocheck
import { afterEach, expect, test } from "bun:test";
import * as THREE from "three";
import { createBerlinCameraDensitySampler } from "../heatmaps/camera-density";
import { setBerlinCameraDensitySamplerForTests } from "../heatmaps/camera-density-loader";
import {
  applyBerlinCornerCandidateStage,
  getAllowedCandidateCount,
} from "./corner-filter";

afterEach(() => {
  setBerlinCameraDensitySamplerForTests(null);
});

test("getAllowedCandidateCount applies the heatmap thresholds", () => {
  expect(getAllowedCandidateCount(0.339)).toBe(0);
  expect(getAllowedCandidateCount(0.34)).toBe(1);
  expect(getAllowedCandidateCount(0.67)).toBe(2);
});

test("applyBerlinCornerCandidateStage trims each building deterministically from sampled density", () => {
  setBerlinCameraDensitySamplerForTests(
    createBerlinCameraDensitySampler({
      imageOrientation: "north-up",
      bounds: {
        north: 52.675,
        south: 52.338,
        west: 13.088,
        east: 13.761,
      },
      width: 3,
      height: 1,
      rgba: new Uint8ClampedArray([
        255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255,
      ]),
    }),
  );

  const stagedCandidates = applyBerlinCornerCandidateStage([
    createCandidate("bright-building", 1, 20, -22000, 0, -15000),
    createCandidate("bright-building", 2, 19, -21998, 0, -14998),
    createCandidate("mid-building", 5, 30, 0, 0, 0),
    createCandidate("mid-building", 3, 31, 2, 0, 2),
    createCandidate("dark-building", 7, 40, 22000, 0, 15000),
    createCandidate("dark-building", 4, 42, 22002, 0, 15002),
  ]);

  expect(
    stagedCandidates.map((candidate) => `${candidate.buildingId}:${candidate.cornerIndex}`),
  ).toEqual([
    "mid-building:3",
    "dark-building:7",
    "dark-building:4",
  ]);
});

function createCandidate(buildingId, cornerIndex, elevation, x, y, z) {
  return {
    buildingId,
    sourceKey: `${buildingId}:mesh-0`,
    cornerIndex,
    elevation,
    worldPosition: new THREE.Vector3(x, y, z),
  };
}
