import * as THREE from "three";
import { loadGLTF } from "$lib/three/loader";
import {
  getHexTilePositions,
  type HexTilePosition,
  HEX_RADIUS,
} from "./hex-floor";
import type { VisioTechnologicaState } from "./scene";

const HOCHHAUS_URL = new URL("./3d assets/Tile Hochhaus.glb", import.meta.url)
  .href;
const MIETSKASERNE_URL = new URL(
  "./3d assets/Tile Mietskaserne.glb",
  import.meta.url,
).href;
const PARK_URL = new URL("./3d assets/Tile Park.glb", import.meta.url).href;
const ASPHALT_URL = new URL("./3d assets/Tile Asphalt.glb", import.meta.url)
  .href;
const WIESE_URL = new URL("./3d assets/Tile Wiese.glb", import.meta.url).href;

const ROTATED_TILE_PROBABILITY = 0.35;
const TARGET_TILE_TOP_Y = 0;
const ZONE_COUNT = 3;
const ROTATION_ANGLES_DEGREES = [60, 120] as const;

const ZONE_WEIGHTS = {
  inner: {
    hochhaus: 0.7,
    mietskaserne: 0.15,
    park: 0.05,
    empty: 0.1,
  },
  middle: {
    hochhaus: 0.01,
    mietskaserne: 0.55,
    park: 0.1,
    empty: 0.2,
  },
  outer: {
    hochhaus: 0.0,
    mietskaserne: 0.0,
    park: 0.4,
    empty: 0.3,
  },
} as const;

type ZoneName = keyof typeof ZONE_WEIGHTS;
type WeightedTileKey = "hochhaus" | "mietskaserne" | "park" | "empty";
type ZoneTileAssetKey =
  | "hochhaus"
  | "mietskaserne"
  | "park"
  | "asphalt"
  | "wiese";

export interface ZoneTileAsset {
  key: ZoneTileAssetKey;
  root: THREE.Object3D;
}

async function loadZoneTileAssets(): Promise<ZoneTileAsset[]> {
  const [hochhaus, mietskaserne, park, asphalt, wiese] = await Promise.all([
    loadGLTF(HOCHHAUS_URL),
    loadGLTF(MIETSKASERNE_URL),
    loadGLTF(PARK_URL),
    loadGLTF(ASPHALT_URL),
    loadGLTF(WIESE_URL),
  ]);

  return [
    { key: "hochhaus", root: hochhaus.scene },
    { key: "mietskaserne", root: mietskaserne.scene },
    { key: "park", root: park.scene },
    { key: "asphalt", root: asphalt.scene },
    { key: "wiese", root: wiese.scene },
  ];
}

function getZoneIndex(ring: number, radius: number): number {
  const zoneSize = radius / ZONE_COUNT;

  if (ring < zoneSize) {
    return 0;
  }

  if (ring < zoneSize * 2) {
    return 1;
  }

  return 2;
}

function getZoneName(ring: number, radius: number): ZoneName {
  const zoneIndex = getZoneIndex(ring, radius);

  switch (zoneIndex) {
    case 0:
      return "inner";
    case 1:
      return "middle";
    default:
      return "outer";
  }
}

function getAssetByKey(
  assets: ZoneTileAsset[],
  key: ZoneTileAssetKey,
): ZoneTileAsset {
  const asset = assets.find((candidate) => candidate.key === key);
  if (!asset) {
    throw new Error(`Zone tile asset "${key}" not found.`);
  }
  return asset;
}

function getFallbackAssetForZone(
  zoneName: ZoneName,
  assets: ZoneTileAsset[],
): ZoneTileAsset {
  return zoneName === "outer"
    ? getAssetByKey(assets, "wiese")
    : getAssetByKey(assets, "asphalt");
}

function deterministicUnitValue(tile: HexTilePosition, salt: number): number {
  const hashed = Math.sin(
    tile.x * 12.9898 + tile.z * 78.233 + tile.ring * 37.719 + salt * 17.123,
  );
  return hashed - Math.floor(hashed);
}

function getWeightedTileKey(
  tile: HexTilePosition,
  radius: number,
): WeightedTileKey {
  const zoneName = getZoneName(tile.ring, radius);
  const weights = ZONE_WEIGHTS[zoneName];
  const entries: Array<[WeightedTileKey, number]> = [
    ["hochhaus", weights.hochhaus],
    ["mietskaserne", weights.mietskaserne],
    ["park", weights.park],
    ["empty", weights.empty],
  ];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

  if (totalWeight <= 0) {
    return "empty";
  }

  const target = deterministicUnitValue(tile, 1) * totalWeight;
  let cumulative = 0;

  for (const [key, weight] of entries) {
    cumulative += weight;
    if (target <= cumulative) {
      return key;
    }
  }

  return entries[entries.length - 1][0];
}

function getAssetForTile(
  tile: HexTilePosition,
  radius: number,
  assets: ZoneTileAsset[],
): ZoneTileAsset {
  const weightedKey = getWeightedTileKey(tile, radius);

  if (weightedKey === "empty") {
    return getFallbackAssetForZone(getZoneName(tile.ring, radius), assets);
  }

  return getAssetByKey(assets, weightedKey);
}

function fitObjectToHexTile(object: THREE.Object3D, tileSize: number): number {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.x === 0 || size.z === 0) {
    return 1;
  }

  const targetWidth = tileSize * 2;
  const targetDepth = Math.sqrt(3) * tileSize;
  return Math.min(targetWidth / size.x, targetDepth / size.z);
}

function positionObjectOnTile(
  object: THREE.Object3D,
  tileX: number,
  tileZ: number,
  tileHeight: number,
): void {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  object.position.x += tileX;
  object.position.z += tileZ;
  object.position.y += TARGET_TILE_TOP_Y - bounds.min.y + tileHeight * 0.5;
}

function applyMeshShadowFlags(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function getTileRotationY(tile: HexTilePosition): number {
  if (deterministicUnitValue(tile, 2) >= ROTATED_TILE_PROBABILITY) {
    return 0;
  }

  const angleIndex = Math.floor(
    deterministicUnitValue(tile, 3) * ROTATION_ANGLES_DEGREES.length,
  );
  return THREE.MathUtils.degToRad(ROTATION_ANGLES_DEGREES[angleIndex]);
}

function cloneTileAsset(
  asset: ZoneTileAsset,
  tile: HexTilePosition,
  tileSize: number,
  tileHeight: number,
): THREE.Object3D {
  const clone = asset.root.clone(true);
  const scale = fitObjectToHexTile(clone, tileSize);
  clone.scale.multiplyScalar(scale);
  clone.rotation.y += getTileRotationY(tile);
  positionObjectOnTile(clone, tile.x, tile.z, tileHeight);
  applyMeshShadowFlags(clone);
  return clone;
}

export async function createZonedTiles(
  radius: number,
  tileSize: number,
  tileGap: number,
  tileHeight: number,
): Promise<{ assets: ZoneTileAsset[]; group: THREE.Group }> {
  const assets = await loadZoneTileAssets();
  const group = buildZonedTileGroup(
    assets,
    radius,
    tileSize,
    tileGap,
    tileHeight,
  );
  return { assets, group };
}

export function buildZonedTileGroup(
  assets: ZoneTileAsset[],
  radius: number,
  tileSize: number,
  tileGap: number,
  tileHeight: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "visio-technologica-zoned-tiles";

  for (const tile of getHexTilePositions(radius, tileSize, tileGap)) {
    const asset = getAssetForTile(tile, radius, assets);
    const placedTile = cloneTileAsset(asset, tile, tileSize, tileHeight);
    group.add(placedTile);
  }

  return group;
}

export function disposeZonedTileGroup(
  group: THREE.Group,
  scene: THREE.Scene,
): void {
  scene.remove(group);
  group.clear();
}

export function disposeZoneTileAssets(assets: ZoneTileAsset[]): void {
  for (const asset of assets) {
    asset.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material.dispose();
        }
      } else {
        child.material.dispose();
      }
    });
  }
}

export function rebuildZonedTiles(
  state: VisioTechnologicaState,
  scene: THREE.Scene,
): void {
  disposeZonedTileGroup(state.zonedTiles, scene);
  state.zonedTiles = buildZonedTileGroup(
    state.zoneTileAssets,
    HEX_RADIUS,
    state.tileSize,
    state.tileGap,
    state.tileHeight,
  );
  scene.add(state.zonedTiles);
}
