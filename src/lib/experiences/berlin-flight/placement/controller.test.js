// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinPlacementController } from "./controller";

function createTrackedMesh(id, x, y, z) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 0, 12, 0, 6, 12, 0, 6, 12, 6, 0, 12, 6],
      3,
    ),
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);

  const worldSphere = geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);

  return {
    sourceUrl: `tile://${id}`,
    mesh,
    geometry,
    positions: new Float32Array(geometry.getAttribute("position").array),
    worldPositions: new Float32Array(geometry.getAttribute("position").array.length),
    vertexCount: geometry.getAttribute("position").count,
    vertexMask: new Uint8Array(geometry.getAttribute("position").count),
    coneMaskAttribute: null,
    originalMaterial: mesh.material,
    collisionMaterial: mesh.material,
    localBounds: geometry.boundingBox.clone(),
    localSphere: geometry.boundingSphere.clone(),
    cachedBoundsMatrix: mesh.matrixWorld.clone(),
    cachedVertexWorldMatrix: mesh.matrixWorld.clone(),
    worldSphere,
  };
}

test("BerlinPlacementController updates incrementally and prunes out-of-range buildings", () => {
  const controller = new BerlinPlacementController();
  const playerPosition = new THREE.Vector3(0, 0, 0);
  const nearbyMesh = createTrackedMesh("near", 0, 0, 0);
  const farMesh = createTrackedMesh("far", 900, 0, 0);

  controller.update(playerPosition, [nearbyMesh, farMesh], 1);

  expect(controller.getAcceptedPoints()).toHaveLength(1);

  controller.update(new THREE.Vector3(600, 0, 0), [nearbyMesh, farMesh], 1);

  expect(controller.getAcceptedPoints()).toHaveLength(1);
  expect(controller.getAcceptedPoints()[0].sourceKey.startsWith("tile://far")).toBe(
    true,
  );
});

test("BerlinPlacementController keeps pending building work when new tile meshes arrive", () => {
  const controller = new BerlinPlacementController();
  const playerPosition = new THREE.Vector3(0, 0, 0);
  const meshes = [];

  for (let index = 0; index < 30; index += 1) {
    const x = (index % 6) * 40;
    const z = Math.floor(index / 6) * 40;
    meshes.push(createTrackedMesh(`mesh-${index}`, x, 0, z));
  }

  controller.update(playerPosition, meshes, 1);
  expect(controller.getAcceptedPoints()).toHaveLength(24);

  controller.update(playerPosition, meshes, 2);
  expect(controller.getAcceptedPoints()).toHaveLength(30);
});
