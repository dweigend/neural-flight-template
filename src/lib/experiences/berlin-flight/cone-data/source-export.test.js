// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { preprocessTrackedMesh } from "../collision/mesh-preprocess";
import { buildBerlinConeSourceMeshFile } from "./source-export";

function createTrackedMesh(sourceUrl, position) {
  const geometry = new THREE.BoxGeometry(60, 30, 60, 1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);

  const trackedMesh = preprocessTrackedMesh(mesh, material);
  if (!trackedMesh) {
    throw new Error("failed to create tracked mesh");
  }

  trackedMesh.sourceUrl = sourceUrl;
  return trackedMesh;
}

test("buildBerlinConeSourceMeshFile exports all tracked meshes within the radius", () => {
  const trackedMeshes = [
    createTrackedMesh("near-a", new THREE.Vector3(0, 20, 0)),
    createTrackedMesh("near-b", new THREE.Vector3(800, 20, 0)),
    createTrackedMesh("far-c", new THREE.Vector3(1500, 20, 0)),
  ];

  const result = buildBerlinConeSourceMeshFile(trackedMeshes, {
    center: { x: 0, z: 0 },
    radiusMeters: 1000,
  });

  expect(result.trackedMeshesSeen).toBe(3);
  expect(result.sourceMeshesInRadius).toBe(2);
  expect(result.file.meshes).toHaveLength(2);
  expect(result.file.meshes[0].positions.length).toBeGreaterThan(0);
});
