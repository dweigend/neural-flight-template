import type * as THREE from "three";

export type BerlinTileMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

export interface TrackedTileMesh {
  mesh: BerlinTileMesh;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  worldPositions: Float32Array;
  vertexCount: number;
  vertexMask: Uint8Array;
  coneMaskAttribute: THREE.BufferAttribute | null;
  originalMaterial: THREE.Material | THREE.Material[];
  collisionMaterial: THREE.Material | THREE.Material[];
  localBounds: THREE.Box3;
  localSphere: THREE.Sphere;
  cachedBoundsMatrix: THREE.Matrix4;
  cachedVertexWorldMatrix: THREE.Matrix4;
  worldSphere: THREE.Sphere;
}
