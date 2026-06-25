import * as THREE from "three";
import { BERLIN_TILE_LOOK } from "../constants";

type ShaderCompileParameters = Parameters<
  THREE.Material["onBeforeCompile"]
>[0];

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

const shaderNeutralColor = new THREE.Color(BERLIN_TILE_LOOK.NEUTRAL_COLOR);

export function createBerlinTileMaterial(
  sourceMaterial: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => cloneBerlinTileMaterial(material));
  }

  return cloneBerlinTileMaterial(sourceMaterial);
}

export function disposeClonedMaterial(
  material: THREE.Material | THREE.Material[],
  disposedMaterials?: WeakSet<THREE.Material>,
): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeClonedSingleMaterial(entry, disposedMaterials);
    }
    return;
  }

  disposeClonedSingleMaterial(material, disposedMaterials);
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

function cloneBerlinTileMaterial(sourceMaterial: THREE.Material): THREE.Material {
  const material = sourceMaterial.clone();
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousProgramCacheKey =
    typeof material.customProgramCacheKey === "function"
      ? material.customProgramCacheKey.bind(material)
      : null;

  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;
  if ("metalness" in material) {
    (material as THREE.MeshStandardMaterial).metalness = BERLIN_TILE_LOOK.METALNESS;
  }
  if ("roughness" in material) {
    (material as THREE.MeshStandardMaterial).roughness = BERLIN_TILE_LOOK.ROUGHNESS;
  }
  if ("opacity" in material) {
    material.opacity = BERLIN_TILE_LOOK.OPACITY;
  }
  if ("flatShading" in material) {
    (
      material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial
    ).flatShading = true;
  }
  if ("transparent" in material) {
    material.transparent = true;
  }

  material.onBeforeCompile = (shader: ShaderCompileParameters, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.uBerlinNeutralColor = { value: shaderNeutralColor };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float coneMask;\nvarying float vBerlinConeMask;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBerlinConeMask = coneMask;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uBerlinNeutralColor;\nvarying float vBerlinConeMask;",
      )
      .replace(
        "#include <map_fragment>",
        "vec3 berlinFlatColor = uBerlinNeutralColor;\n#include <map_fragment>\ndiffuseColor.rgb = mix(berlinFlatColor, diffuseColor.rgb, clamp(vBerlinConeMask, 0.0, 1.0));",
      );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey?.() ?? material.type}:berlin-cone-mask-v2`;

  return material;
}

function disposeClonedSingleMaterial(
  material: THREE.Material,
  disposedMaterials?: WeakSet<THREE.Material>,
): void {
  if (disposedMaterials?.has(material)) return;

  disposedMaterials?.add(material);
  material.dispose();
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
