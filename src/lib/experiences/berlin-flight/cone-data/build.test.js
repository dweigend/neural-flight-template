// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
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
  expect(result.stats.generatedCones).toBeGreaterThan(0);

  const firstChunk = Array.from(result.chunks.values())[0];
  expect(firstChunk.positions.length % 6).toBe(0);
  expect(firstChunk.scalars.length % 2).toBe(0);
  expect(firstChunk.coneIndex.length).toBeGreaterThan(0);
});
