import * as THREE from "three";
import type { BerlinConeVolume } from "../collision/types";
import { BERLIN_CONE_GRID } from "../constants";
import type { ConeChunkCoordinate } from "./cone-grid-coordinates";
import { getConeChunkKey } from "./cone-grid-coordinates";

const instanceDummy = new THREE.Object3D();

export type ConeGridChunk = {
  allCones: readonly BerlinConeVolume[];
  cones: BerlinConeVolume[];
  key: string;
  matrices: readonly THREE.Matrix4[];
  mesh: THREE.InstancedMesh;
};

export function createConeGridChunk(
  coordinate: ConeChunkCoordinate,
  geometry: THREE.ConeGeometry,
  material: THREE.MeshBasicMaterial,
): ConeGridChunk {
  const coneCount =
    BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE *
    BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;
  const mesh = new THREE.InstancedMesh(geometry, material, coneCount);
  const chunkKey = getConeChunkKey(coordinate);
  mesh.name = `BerlinConeChunk:${chunkKey}`;

  const baseGridX = coordinate.x * BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;
  const baseGridZ = coordinate.z * BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;
  const allCones: BerlinConeVolume[] = [];
  const matrices: THREE.Matrix4[] = [];
  let instanceIndex = 0;

  for (let localZ = 0; localZ < BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE; localZ += 1) {
    for (
      let localX = 0;
      localX < BERLIN_CONE_GRID.CHUNK_CONES_PER_SIDE;
      localX += 1
    ) {
      const gridX = baseGridX + localX;
      const gridZ = baseGridZ + localZ;

      instanceDummy.position.set(
        gridX * BERLIN_CONE_GRID.SPACING,
        BERLIN_CONE_GRID.ORIGIN_HEIGHT,
        gridZ * BERLIN_CONE_GRID.SPACING,
      );
      instanceDummy.rotation.set(0, 0, 0);
      instanceDummy.scale.setScalar(1);
      instanceDummy.updateMatrix();
      const matrix = instanceDummy.matrix.clone();
      mesh.setMatrixAt(instanceIndex, matrix);
      matrices.push(matrix);
      allCones.push({
        center: new THREE.Vector3(
          instanceDummy.position.x,
          instanceDummy.position.y - BERLIN_CONE_GRID.CONE_HEIGHT / 2,
          instanceDummy.position.z,
        ),
        radius: BERLIN_CONE_GRID.CONE_RADIUS,
        height: BERLIN_CONE_GRID.CONE_HEIGHT,
        chunkKey,
        coneIndex: instanceIndex,
      });
      instanceIndex += 1;
    }
  }

  mesh.instanceMatrix.needsUpdate = true;

  return {
    allCones,
    cones: [],
    key: chunkKey,
    matrices,
    mesh,
  };
}
