// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { sampleBerlinMeshNeighborhood } from "./mesh-neighborhood";

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

test("sampleBerlinMeshNeighborhood skips the roof point itself and keeps the nearest horizontal sample", () => {
  const point = {
    pointId: "point-a",
    buildingId: "building-a",
    sourceKey: "tile://test:mesh-0",
    cornerIndex: 0,
    elevation: 20,
    worldPosition: new THREE.Vector3(0, 20, 0),
  };
  const trackedMesh = createTrackedMesh([
    0,
    20,
    0,
    4,
    20,
    0,
    7,
    20,
    0,
    9,
    20,
    0,
    0,
    27,
    0,
  ]);

  const neighborhood = sampleBerlinMeshNeighborhood(point, [trackedMesh]);

  expect(neighborhood).not.toBeNull();
  expect(neighborhood.sampleCount).toBe(3);
  expect(neighborhood.contributingMeshCount).toBe(1);
  expect(neighborhood.nearestWorldPoint.toArray()).toEqual([4, 20, 0]);
  expect(neighborhood.directionToGeometry.toArray()).toEqual([4, 0, 0]);
  expect(neighborhood.horizontalDirectionToGeometry.toArray()).toEqual([3, 0, 0]);
});

test("sampleBerlinMeshNeighborhood stabilizes direction from the nearest horizontal samples", () => {
  const point = {
    pointId: "point-a",
    buildingId: "building-a",
    sourceKey: "tile://test:mesh-0",
    cornerIndex: 0,
    elevation: 20,
    worldPosition: new THREE.Vector3(0, 20, 0),
  };
  const trackedMesh = createTrackedMesh([
    4,
    20,
    0,
    5,
    20,
    1,
    6,
    20,
    -1,
    -20,
    20,
    0,
  ]);

  const neighborhood = sampleBerlinMeshNeighborhood(point, [trackedMesh]);

  expect(neighborhood).not.toBeNull();
  expect(neighborhood.horizontalDirectionToGeometry.x).toBeGreaterThan(0);
  expect(Math.abs(neighborhood.horizontalDirectionToGeometry.z)).toBeLessThan(0.05);
});
