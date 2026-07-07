// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { preprocessTrackedMesh } from "../collision/mesh-preprocess";
import { buildBerlinConeSourceMeshFile } from "./source-export";
import { buildBerlinSourceFilesBySourceUrl } from "./full-city-export";

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

test("buildBerlinConeSourceMeshFile exports current parent transforms", () => {
  const trackedMesh = createTrackedMesh("tile-a", new THREE.Vector3(0, 20, 0));
  const parent = new THREE.Group();
  parent.position.set(120, 0, 0);
  parent.add(trackedMesh.mesh);

  const result = buildBerlinConeSourceMeshFile([trackedMesh], {
    center: { x: 120, z: 0 },
    radiusMeters: 1000,
  });

  expect(result.file.meshes[0].matrixWorld?.[12]).toBe(120);
});

test("buildBerlinSourceFilesBySourceUrl groups meshes by sourceUrl and skips seen tiles", () => {
  const trackedMeshes = [
    createTrackedMesh("tile-b", new THREE.Vector3(800, 20, 0)),
    createTrackedMesh("tile-a", new THREE.Vector3(0, 20, 0)),
    createTrackedMesh("tile-a", new THREE.Vector3(30, 20, 0)),
  ];

  const result = buildBerlinSourceFilesBySourceUrl(
    trackedMeshes,
    new Set(["tile-b"]),
  );

  expect(result.sourceUrlsAdded).toBe(1);
  expect(result.meshesAdded).toBe(2);
  expect(Array.from(result.filesBySourceUrl.keys())).toEqual(["tile-a"]);
  expect(result.filesBySourceUrl.get("tile-a")?.meshes).toHaveLength(2);
});
