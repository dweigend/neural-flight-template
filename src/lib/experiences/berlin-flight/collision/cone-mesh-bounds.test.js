// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { overlapsConeBounds } from "./cone-mesh-bounds";

function createTrackedMesh(center, radius) {
  const geometry = new THREE.SphereGeometry(radius, 8, 8);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.copy(center);
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

test("overlapsConeBounds accepts nearby meshes around oriented cones", () => {
  const cone = {
    tip: new THREE.Vector3(0, 20, 0),
    axisDirection: new THREE.Vector3(1, -1, 0).normalize(),
    height: 10,
    radius: 3,
    baseCenter: new THREE.Vector3().copy(new THREE.Vector3(0, 20, 0)).addScaledVector(
      new THREE.Vector3(1, -1, 0).normalize(),
      10,
    ),
    placementPointId: "point-a",
    sourceBuildingId: "building-a",
    chunkKey: "source-a",
    coneIndex: 0,
  };
  const mesh = createTrackedMesh(new THREE.Vector3(4, 16, 0), 2);

  expect(overlapsConeBounds(cone, mesh)).toBe(true);
});

test("overlapsConeBounds rejects distant meshes", () => {
  const cone = {
    tip: new THREE.Vector3(0, 20, 0),
    axisDirection: new THREE.Vector3(0, -1, 0),
    height: 10,
    radius: 3,
    baseCenter: new THREE.Vector3(0, 10, 0),
    placementPointId: "point-a",
    sourceBuildingId: "building-a",
    chunkKey: "source-a",
    coneIndex: 0,
  };
  const mesh = createTrackedMesh(new THREE.Vector3(50, 50, 50), 2);

  expect(overlapsConeBounds(cone, mesh)).toBe(false);
});
