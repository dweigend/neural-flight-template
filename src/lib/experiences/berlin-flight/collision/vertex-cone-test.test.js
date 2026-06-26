// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { isVertexInsideCone } from "./vertex-cone-test";

test("isVertexInsideCone matches an oriented cone volume", () => {
  const axisDirection = new THREE.Vector3(1, -1, 0).normalize();
  const cone = {
    tip: new THREE.Vector3(0, 20, 0),
    axisDirection,
    height: 10,
    radius: 4,
    baseCenter: new THREE.Vector3().copy(new THREE.Vector3(0, 20, 0)).addScaledVector(
      axisDirection,
      10,
    ),
    placementPointId: "point-a",
    sourceBuildingId: "building-a",
    chunkKey: "source-a",
    coneIndex: 0,
  };
  const insidePoint = new THREE.Vector3(3, 15, 0);
  const outsidePoint = new THREE.Vector3(-2, 17, 0);

  expect(isVertexInsideCone(insidePoint, cone)).toBe(true);
  expect(isVertexInsideCone(outsidePoint, cone)).toBe(false);
});

test("isVertexInsideCone rejects points past the tip or base", () => {
  const cone = {
    tip: new THREE.Vector3(0, 20, 0),
    axisDirection: new THREE.Vector3(0, -1, 0),
    height: 10,
    radius: 4,
    baseCenter: new THREE.Vector3(0, 10, 0),
    placementPointId: "point-a",
    sourceBuildingId: "building-a",
    chunkKey: "source-a",
    coneIndex: 0,
  };

  expect(isVertexInsideCone(new THREE.Vector3(0, 21, 0), cone)).toBe(false);
  expect(isVertexInsideCone(new THREE.Vector3(0, 9, 0), cone)).toBe(false);
});
