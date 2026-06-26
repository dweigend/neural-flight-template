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
const shaderNeutralLightDirection = new THREE.Vector3(
  BERLIN_TILE_LOOK.NEUTRAL_SHADE_LIGHT_DIRECTION.x,
  BERLIN_TILE_LOOK.NEUTRAL_SHADE_LIGHT_DIRECTION.y,
  BERLIN_TILE_LOOK.NEUTRAL_SHADE_LIGHT_DIRECTION.z,
).normalize();
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
  if ("transparent" in material) {
    material.transparent = true;
  }

  material.onBeforeCompile = (shader: ShaderCompileParameters, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.uBerlinNeutralColor = { value: shaderNeutralColor };
    shader.uniforms.uBerlinOutsideOpacity = { value: BERLIN_TILE_LOOK.OPACITY };
    shader.uniforms.uBerlinNeutralLightDirection = {
      value: shaderNeutralLightDirection,
    };
    shader.uniforms.uBerlinNeutralShadeAmbient = {
      value: BERLIN_TILE_LOOK.NEUTRAL_SHADE_AMBIENT,
    };
    shader.uniforms.uBerlinNeutralShadeHemisphere = {
      value: BERLIN_TILE_LOOK.NEUTRAL_SHADE_HEMISPHERE,
    };
    shader.uniforms.uBerlinNeutralShadeDirectional = {
      value: BERLIN_TILE_LOOK.NEUTRAL_SHADE_DIRECTIONAL,
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float coneMask;\nvarying float vBerlinConeMask;\nvarying vec3 vBerlinWorldPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBerlinConeMask = coneMask;\nvBerlinWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uBerlinNeutralColor;\nuniform float uBerlinOutsideOpacity;\nuniform vec3 uBerlinNeutralLightDirection;\nuniform float uBerlinNeutralShadeAmbient;\nuniform float uBerlinNeutralShadeHemisphere;\nuniform float uBerlinNeutralShadeDirectional;\nvarying float vBerlinConeMask;\nvarying vec3 vBerlinWorldPosition;",
      )
      .replace(
        "#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\nfloat berlinConeMaskForNormal = clamp(vBerlinConeMask, 0.0, 1.0);\nvec3 berlinFlatNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));\nnormal = normalize(mix(berlinFlatNormal, normal, berlinConeMaskForNormal));",
      )
      .replace(
        "#include <map_fragment>",
        "float berlinConeMask = clamp(vBerlinConeMask, 0.0, 1.0);\nvec3 berlinFlatColor = uBerlinNeutralColor;\nvec3 berlinWorldNormal = normalize(cross(dFdx(vBerlinWorldPosition), dFdy(vBerlinWorldPosition)));\nfloat berlinDirectional = max(dot(berlinWorldNormal, normalize(uBerlinNeutralLightDirection)), 0.0);\nfloat berlinHemisphere = berlinWorldNormal.y * 0.5 + 0.5;\nfloat berlinShade = clamp(\n  uBerlinNeutralShadeAmbient +\n    berlinHemisphere * uBerlinNeutralShadeHemisphere +\n    berlinDirectional * uBerlinNeutralShadeDirectional,\n  0.0,\n  1.0\n);\nvec3 berlinShadedFlatColor = berlinFlatColor * berlinShade;\n#include <map_fragment>\ndiffuseColor.rgb = mix(berlinShadedFlatColor, diffuseColor.rgb, berlinConeMask);\ndiffuseColor.a = mix(uBerlinOutsideOpacity, 1.0, berlinConeMask);",
      );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey?.() ?? material.type}:berlin-cone-mask-v3`;

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
