import * as THREE from "three";
import type { BerlinTileMesh, TrackedTileMesh } from "./tile-mesh-types";

export function preprocessTrackedMesh(
  mesh: BerlinTileMesh,
  collisionMaterial: THREE.Material | THREE.Material[],
): TrackedTileMesh | null {
  const geometry = mesh.geometry;
  const originalMaterial = mesh.material;
  const positionAttribute = geometry.getAttribute("position");

  if (!(positionAttribute instanceof THREE.BufferAttribute)) {
    return null;
  }

  if (positionAttribute.itemSize < 3) {
    return null;
  }

  const positions = new Float32Array(positionAttribute.array);
  const worldPositions = new Float32Array(positions.length);
  const vertexCount = positionAttribute.count;
  const coneMaskAttribute = geometry.getAttribute("coneMask");

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  copyWorldPositions(positions, worldPositions, vertexCount, mesh.matrixWorld);

  return {
    sourceUrl: "",
    mesh,
    geometry,
    positions,
    worldPositions,
    vertexCount,
    vertexMask: new Uint8Array(vertexCount),
    coneMaskAttribute:
      coneMaskAttribute instanceof THREE.BufferAttribute ? coneMaskAttribute : null,
    originalMaterial,
    collisionMaterial,
    localBounds: geometry.boundingBox?.clone() ?? new THREE.Box3(),
    localSphere: geometry.boundingSphere?.clone() ?? new THREE.Sphere(),
    cachedBoundsMatrix: mesh.matrixWorld.clone(),
    cachedVertexWorldMatrix: mesh.matrixWorld.clone(),
    worldSphere:
      geometry.boundingSphere?.clone().applyMatrix4(mesh.matrixWorld) ??
      new THREE.Sphere(),
  };
}

function copyWorldPositions(
  positions: Float32Array,
  worldPositions: Float32Array,
  vertexCount: number,
  matrixWorld: THREE.Matrix4,
): void {
  const scratchPosition = new THREE.Vector3();

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    scratchPosition.fromArray(positions, offset);
    scratchPosition.applyMatrix4(matrixWorld);
    scratchPosition.toArray(worldPositions, offset);
  }
}
