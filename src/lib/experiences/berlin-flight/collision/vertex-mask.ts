import * as THREE from "three";
import type { BerlinConeVolume } from "./types";
import type { TrackedTileMesh } from "./tile-mesh-types";
import { isVertexInsideCone } from "./vertex-cone-test";

const scratchPosition = new THREE.Vector3();

export function updateVertexMask(
  mesh: TrackedTileMesh,
  cones: readonly BerlinConeVolume[],
): void {
  mesh.vertexMask.fill(0);
  if (cones.length === 0) return;

  updateTrackedMeshWorldPositions(mesh);

  for (let vertexIndex = 0; vertexIndex < mesh.vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    scratchPosition.fromArray(mesh.worldPositions, offset);

    for (const cone of cones) {
      if (!isVertexInsideCone(scratchPosition, cone)) continue;

      mesh.vertexMask[vertexIndex] = 1;
      break;
    }
  }
}

function updateTrackedMeshWorldPositions(mesh: TrackedTileMesh): void {
  if (
    mesh.worldPositionsInitialized &&
    mesh.cachedVertexWorldMatrix.equals(mesh.mesh.matrixWorld)
  ) {
    return;
  }

  mesh.cachedVertexWorldMatrix.copy(mesh.mesh.matrixWorld);
  mesh.worldPositionsInitialized = true;

  for (let vertexIndex = 0; vertexIndex < mesh.vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    scratchPosition.fromArray(mesh.positions, offset);
    scratchPosition.applyMatrix4(mesh.cachedVertexWorldMatrix);
    scratchPosition.toArray(mesh.worldPositions, offset);
  }
}
