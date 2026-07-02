// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinCollisionController } from "./controller";
import { preprocessTrackedMesh } from "./mesh-preprocess";
import { initializeConeMaskAttributeForMesh } from "./vertex-color-writer";

function createTrackedMesh() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0,
        0, 10, 0,
        1, 0, 0,
      ],
      3,
    ),
  );
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);

  const trackedMesh = preprocessTrackedMesh(mesh, material);
  if (!trackedMesh) {
    throw new Error("Failed to create tracked mesh for collision test.");
  }

  initializeConeMaskAttributeForMesh(trackedMesh);
  trackedMesh.sourceUrl = "collision-test";
  return trackedMesh;
}

function createCone() {
  return {
    tip: new THREE.Vector3(0, 10, 0),
    axisDirection: new THREE.Vector3(0, -1, 0),
    radius: 10,
    height: 20,
    baseCenter: new THREE.Vector3(0, -10, 0),
    placementPointId: "0:0:0",
    sourceBuildingId: "0:0",
    chunkKey: "0:0",
    coneIndex: 0,
  };
}

test("BerlinCollisionController invalidates tracked meshes when cone stream changes", () => {
  const controller = new BerlinCollisionController();
  const trackedMesh = createTrackedMesh();
  const cones = [createCone()];

  controller.update(cones, 1, [trackedMesh], 1);

  expect(Array.from(trackedMesh.vertexMask)).toContain(1);

  controller.update([], 2, [trackedMesh], 1);

  expect(Array.from(trackedMesh.vertexMask)).toEqual([0, 0, 0]);
});
