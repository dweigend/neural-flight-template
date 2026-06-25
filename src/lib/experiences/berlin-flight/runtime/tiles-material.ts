import * as THREE from "three";
import { BERLIN_TILE_LOOK } from "../constants";

type MaterialWithTextureMaps = THREE.Material & {
  alphaMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  map?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  specularMap?: THREE.Texture | null;
};

export function createBerlinTileMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    depthTest: true,
    depthWrite: true,
    flatShading: true,
    metalness: BERLIN_TILE_LOOK.METALNESS,
    opacity: BERLIN_TILE_LOOK.OPACITY,
    roughness: BERLIN_TILE_LOOK.ROUGHNESS,
    transparent: true,
    vertexColors: true,
  });
}

export function disposeMaterial(
  material: THREE.Material | THREE.Material[],
  disposedMaterials?: WeakSet<THREE.Material>,
): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeSingleMaterial(entry, disposedMaterials);
    }
    return;
  }

  disposeSingleMaterial(material, disposedMaterials);
}

function disposeSingleMaterial(
  material: THREE.Material,
  disposedMaterials?: WeakSet<THREE.Material>,
): void {
  if (disposedMaterials?.has(material)) return;

  disposedMaterials?.add(material);

  const materialWithMaps = material as MaterialWithTextureMaps;
  materialWithMaps.map?.dispose();
  materialWithMaps.alphaMap?.dispose();
  materialWithMaps.aoMap?.dispose();
  materialWithMaps.bumpMap?.dispose();
  materialWithMaps.displacementMap?.dispose();
  materialWithMaps.emissiveMap?.dispose();
  materialWithMaps.lightMap?.dispose();
  materialWithMaps.metalnessMap?.dispose();
  materialWithMaps.normalMap?.dispose();
  materialWithMaps.roughnessMap?.dispose();
  materialWithMaps.specularMap?.dispose();
  material.dispose();
}
