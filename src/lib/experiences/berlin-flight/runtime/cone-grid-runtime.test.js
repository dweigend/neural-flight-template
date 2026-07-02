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
