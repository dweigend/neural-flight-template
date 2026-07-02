// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinConeGridRuntime } from "./cone-grid-runtime";

test("BerlinConeGridRuntime consumes external cone descriptors", () => {
  const runtime = new BerlinConeGridRuntime();
  const cone = {
    tip: new THREE.Vector3(10, 50, -4),
    axisDirection: new THREE.Vector3(0, -1, 0),
    height: 180,
    radius: 48,
    baseCenter: new THREE.Vector3(10, -130, -4),
    placementPointId: "point-a",
    sourceBuildingId: "building-a",
    chunkKey: "source-a",
    coneIndex: 0,
  };

  runtime.setActiveCones([cone], 1);

  expect(runtime.getActiveCones()).toHaveLength(1);
  expect(runtime.getActiveCones()[0].placementPointId).toBe("point-a");
  expect(runtime.getActiveConeChunks()).toHaveLength(1);
  expect(runtime.root.children).toHaveLength(1);

  runtime.dispose();
});
