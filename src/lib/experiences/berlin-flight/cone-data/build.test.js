// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import {
  createBerlinConeChunkSnapshot,
  parseBerlinConeChunkData,
} from "./asset-loader";
import {
  buildBerlinConeDataset,
  createTrackedMeshFromOfflineGeometry,
} from "./build";

function createBoxTrackedMesh(sourceUrl, position) {
  const geometry = new THREE.BoxGeometry(60, 30, 60, 4, 1, 4);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);

  const positions = Array.from(geometry.getAttribute("position").array);

  return createTrackedMeshFromOfflineGeometry({
    positions,
    matrixWorld: Array.from(mesh.matrixWorld.elements),
    sourceUrl,
  });
}

test("buildBerlinConeDataset creates chunked cone output from offline meshes", () => {
  const trackedMeshes = [
    createBoxTrackedMesh("mesh-a", new THREE.Vector3(0, 20, 0)),
    createBoxTrackedMesh("mesh-b", new THREE.Vector3(120, 20, 0)),
    createBoxTrackedMesh("mesh-c", new THREE.Vector3(0, 20, 120)),
  ];

  const result = buildBerlinConeDataset({
    trackedMeshes,
    densitySampler: {
      sampleDensity() {
        return 1;
      },
    },
  });

  expect(result.manifest.chunkCount).toBeGreaterThan(0);
  expect(result.stats.scannedBuildings).toBe(3);
  expect(result.stats.rawCandidates).toBeGreaterThan(0);
  expect(result.stats.stagedCandidates).toBeGreaterThan(0);
  expect(result.stats.rejectedByDensity).toBeGreaterThanOrEqual(0);
  expect(result.stats.rejectedBySpacing).toBeGreaterThanOrEqual(0);
  expect(result.stats.generatedCones).toBeGreaterThan(0);

  const firstChunk = Array.from(result.chunks.values())[0];
  expect(firstChunk.positions.length % 6).toBe(0);
  expect(firstChunk.scalars.length % 2).toBe(0);
  expect(firstChunk.coneIndex.length).toBeGreaterThan(0);
});

test("buildBerlinConeDataset can filter buildings by radius around a center", () => {
  const trackedMeshes = [
    createBoxTrackedMesh("near-a", new THREE.Vector3(0, 20, 0)),
    createBoxTrackedMesh("near-b", new THREE.Vector3(900, 20, 0)),
    createBoxTrackedMesh("far-c", new THREE.Vector3(1300, 20, 0)),
  ];

  const result = buildBerlinConeDataset({
    trackedMeshes,
    densitySampler: {
      sampleDensity() {
        return 1;
      },
    },
    radiusFilter: {
      center: { x: 0, z: 0 },
      radiusMeters: 1000,
    },
  });

  expect(result.stats.sourceMeshes).toBe(2);
  expect(result.stats.scannedBuildings).toBe(2);
  expect(result.stats.rawCandidates).toBeGreaterThan(0);
  expect(result.stats.generatedCones).toBeGreaterThan(0);
});

test("buildBerlinConeDataset chunk data round-trips through the runtime loader", () => {
  const trackedMeshes = [
    createBoxTrackedMesh("mesh-a", new THREE.Vector3(0, 20, 0)),
    createBoxTrackedMesh("mesh-b", new THREE.Vector3(120, 20, 0)),
  ];

  const result = buildBerlinConeDataset({
    trackedMeshes,
    densitySampler: {
      sampleDensity() {
        return 1;
      },
    },
  });

  const firstChunk = Array.from(result.chunks.values())[0];
  const parsedChunk = parseBerlinConeChunkData({
    chunkKey: firstChunk.chunkKey,
    chunkWorldMinX: firstChunk.chunkWorldMinX,
    chunkWorldMinZ: firstChunk.chunkWorldMinZ,
    chunkSizeMeters: firstChunk.chunkSizeMeters,
    positions: Array.from(firstChunk.positions),
    scalars: Array.from(firstChunk.scalars),
    coneIndex: Array.from(firstChunk.coneIndex),
  });
  const snapshot = createBerlinConeChunkSnapshot(parsedChunk);

  expect(snapshot.key).toBe(firstChunk.chunkKey);
  expect(snapshot.cones).toHaveLength(firstChunk.coneIndex.length);
  expect(snapshot.cones[0].tip.toArray()).toEqual([
    firstChunk.positions[0],
    firstChunk.positions[1],
    firstChunk.positions[2],
  ]);
  expect(snapshot.cones[0].axisDirection.toArray()).toEqual([
    firstChunk.positions[3],
    firstChunk.positions[4],
    firstChunk.positions[5],
  ]);
});
