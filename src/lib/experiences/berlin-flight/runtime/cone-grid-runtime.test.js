// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinConeGridRuntime } from "./cone-grid-runtime";

function createLoader() {
  return {
    async loadManifest() {
      return {
        version: 1,
        origin: { x: 0, z: 0 },
        chunkSizeMeters: 1920,
        bounds: {
          minChunkX: 0,
          maxChunkX: 0,
          minChunkZ: 0,
          maxChunkZ: 0,
        },
        chunkCount: 1,
      };
    },
    async loadChunk() {
      return {
        key: "0:0",
        cones: [
          {
            tip: new THREE.Vector3(10, 50, -4),
            axisDirection: new THREE.Vector3(0, -1, 0),
            height: 180,
            radius: 48,
            baseCenter: new THREE.Vector3(10, -130, -4),
            placementPointId: "0:0:0",
            sourceBuildingId: "0:0",
            chunkKey: "0:0",
            coneIndex: 0,
          },
        ],
      };
    },
  };
}

test("BerlinConeGridRuntime consumes precomputed chunk data", async () => {
  const runtime = new BerlinConeGridRuntime(createLoader());

  runtime.update(new THREE.Vector3(0, 0, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(runtime.getActiveCones()).toHaveLength(1);
  expect(runtime.getActiveCones()[0].placementPointId).toBe("0:0:0");
  expect(runtime.getActiveConeChunks()).toHaveLength(1);
  expect(runtime.getSnapshotVersion()).toBe(1);
  expect(runtime.root.children).toHaveLength(1);

  runtime.dispose();
});

test("BerlinConeGridRuntime applies the latest queued observer position after a load", async () => {
  let loadChunkCalls = 0;
  const runtime = new BerlinConeGridRuntime({
    async loadManifest() {
      return {
        version: 1,
        origin: { x: 0, z: 0 },
        chunkSizeMeters: 1920,
        bounds: {
          minChunkX: -1,
          maxChunkX: 0,
          minChunkZ: -1,
          maxChunkZ: 0,
        },
        chunkCount: 4,
      };
    },
    async loadChunk(chunkKey) {
      loadChunkCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        key: chunkKey,
        cones: [
          {
            tip: new THREE.Vector3(chunkKey.startsWith("-1") ? -10 : 10, 50, 0),
            axisDirection: new THREE.Vector3(0, -1, 0),
            height: 180,
            radius: 48,
            baseCenter: new THREE.Vector3(
              chunkKey.startsWith("-1") ? -10 : 10,
              -130,
              0,
            ),
            placementPointId: `${chunkKey}:0`,
            sourceBuildingId: chunkKey,
            chunkKey,
            coneIndex: 0,
          },
        ],
      };
    },
  });

  runtime.update(new THREE.Vector3(0, 0, 0));
  runtime.update(new THREE.Vector3(-1921, 0, 0));
  await waitFor(
    () => runtime.getActiveConeChunks().map((chunk) => chunk.key).join("|"),
    "-1:-1|-1:0",
  );

  expect(runtime.getActiveConeChunks().map((chunk) => chunk.key)).toEqual([
    "-1:-1",
    "-1:0",
  ]);
  expect(loadChunkCalls).toBeGreaterThan(0);

  runtime.dispose();
});

async function waitFor(read, expectedValue) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (read() === expectedValue) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  expect(read()).toBe(expectedValue);
}
