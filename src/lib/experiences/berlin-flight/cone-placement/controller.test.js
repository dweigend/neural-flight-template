// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BerlinConePlacementController } from "./controller";

function createTrackedMesh(vertices, position = new THREE.Vector3()) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);

  return {
    sourceUrl: "tile://test",
    mesh,
    geometry,
    positions: new Float32Array(geometry.getAttribute("position").array),
    worldPositions: new Float32Array(geometry.getAttribute("position").array),
    vertexCount: geometry.getAttribute("position").count,
    vertexMask: new Uint8Array(geometry.getAttribute("position").count),
    coneMaskAttribute: null,
    originalMaterial: mesh.material,
    collisionMaterial: mesh.material,
    localBounds: geometry.boundingBox.clone(),
    localSphere: geometry.boundingSphere.clone(),
    cachedBoundsMatrix: mesh.matrixWorld.clone(),
    cachedVertexWorldMatrix: mesh.matrixWorld.clone(),
    worldSphere: geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld),
  };
}

function createAcceptedPoint(pointId, x, y, z) {
  return {
    pointId,
    buildingId: "building-a",
    sourceKey: "tile://test:mesh-0",
    cornerIndex: 0,
    elevation: y,
    worldPosition: new THREE.Vector3(x, y, z),
  };
}

test("BerlinConePlacementController caches active cones and prunes removed points", () => {
  const controller = new BerlinConePlacementController();
  const trackedMesh = createTrackedMesh([
    4,
    19,
    0,
    7,
    19,
    0,
    9,
    19,
    0,
    0,
    28,
    0,
  ]);
  const point = createAcceptedPoint("point-a", 0, 20, 0);

  controller.update([point], [trackedMesh], 1);

  expect(controller.getActiveCones()).toHaveLength(1);
  expect(controller.getActiveCones()[0].placementPointId).toBe("point-a");
  expect(controller.getActiveCones()[0].tip.toArray()).toEqual([0, 20, 0]);
  expect(controller.getSnapshot().counters.pendingPoints).toBe(0);

  controller.update([], [trackedMesh], 1);

  expect(controller.getActiveCones()).toHaveLength(0);
});

test("BerlinConePlacementController keeps unresolved points queued across mesh version changes", () => {
  const controller = new BerlinConePlacementController();
  const trackedMesh = createTrackedMesh([
    4,
    19,
    0,
    7,
    19,
    0,
    9,
    19,
    0,
    0,
    28,
    0,
  ]);
  const points = Array.from({ length: 100 }, (_, index) =>
    createAcceptedPoint(`point-${index}`, 0, 20, 0),
  );

  controller.update(points, [trackedMesh], 1);
  expect(controller.getActiveCones()).toHaveLength(96);
  expect(controller.getSnapshot().counters.pendingPoints).toBe(4);

  controller.update(points, [trackedMesh], 2);
  expect(controller.getActiveCones()).toHaveLength(100);
  expect(controller.getSnapshot().counters.pendingPoints).toBe(0);
});
