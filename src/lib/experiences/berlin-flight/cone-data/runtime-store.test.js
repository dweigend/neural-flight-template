// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinConeChunkRuntimeStore } from "./runtime-store";

function createLoader() {
  const manifest = {
    version: 1,
    origin: { x: 0, z: 0 },
    chunkSizeMeters: 1920,
    bounds: {
      minChunkX: 0,
      maxChunkX: 1,
      minChunkZ: 0,
      maxChunkZ: 0,
    },
    chunkCount: 2,
  };

  return {
    async loadManifest() {
      return manifest;
    },
    async loadChunk(chunkKey) {
      if (chunkKey === "0:0") {
        return {
          key: "0:0",
          cones: [
            {
              tip: new THREE.Vector3(0, 20, 0),
              axisDirection: new THREE.Vector3(0, -1, 0),
              radius: 48,
              height: 180,
              baseCenter: new THREE.Vector3(0, -160, 0),
              placementPointId: "0:0:0",
              sourceBuildingId: "0:0",
              chunkKey: "0:0",
              coneIndex: 0,
            },
          ],
        };
      }

      if (chunkKey === "1:0") {
        return {
          key: "1:0",
          cones: [
            {
              tip: new THREE.Vector3(2000, 20, 0),
              axisDirection: new THREE.Vector3(0, -1, 0),
              radius: 48,
              height: 180,
              baseCenter: new THREE.Vector3(2000, -160, 0),
              placementPointId: "1:0:0",
              sourceBuildingId: "1:0",
              chunkKey: "1:0",
              coneIndex: 0,
            },
          ],
        };
      }

      throw new Error(`missing chunk ${chunkKey}`);
    },
  };
}

test("BerlinConeChunkRuntimeStore loads nearby chunks and exposes active cones", async () => {
  const store = new BerlinConeChunkRuntimeStore(createLoader());

  await store.update(new THREE.Vector3(0, 0, 0));

  expect(store.getActiveConeChunks().length).toBeGreaterThan(0);
  expect(store.getActiveCones().length).toBeGreaterThan(0);
  expect(store.getSnapshotVersion()).toBe(1);
});

test("BerlinConeChunkRuntimeStore drops far chunks from memory", async () => {
  const store = new BerlinConeChunkRuntimeStore(createLoader());

  await store.update(new THREE.Vector3(0, 0, 0));
  await store.update(new THREE.Vector3(1920 * 4, 0, 0));

  expect(store.getLoadedChunkCount()).toBe(0);
});

test("BerlinConeChunkRuntimeStore surfaces chunk load failures", async () => {
  const store = new BerlinConeChunkRuntimeStore({
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
      throw new Error("broken chunk");
    },
  });

  await expect(store.update(new THREE.Vector3(0, 0, 0))).rejects.toThrow(
    "broken chunk",
  );
  expect(store.getLastError()?.message).toContain("broken chunk");
});

test("BerlinConeChunkRuntimeStore respects the per-tick chunk load budget", async () => {
  let loadCount = 0;
  const store = new BerlinConeChunkRuntimeStore({
    async loadManifest() {
      return {
        version: 1,
        origin: { x: 0, z: 0 },
        chunkSizeMeters: 1920,
        bounds: {
          minChunkX: -1,
          maxChunkX: 1,
          minChunkZ: -1,
          maxChunkZ: 1,
        },
        chunkCount: 9,
      };
    },
    async loadChunk(chunkKey) {
      loadCount += 1;
      return {
        key: chunkKey,
        cones: [],
      };
    },
  });

  await store.update(new THREE.Vector3(0, 0, 0));

  expect(loadCount).toBe(3);
  expect(store.getLoadedChunkCount()).toBe(3);
});
