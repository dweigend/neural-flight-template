import * as THREE from "three";
import { createSky } from "$lib/three/sky";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import {
  createKeyboardCameraControls,
  disposeKeyboardCameraControls,
  updateKeyboardCameraControls,
  type KeyboardCameraControls,
} from "./keyboard-camera-controls";
import { createHexFloor, disposeHexFloor, HEX_RADIUS } from "./hex-floor";
import {
  createZonedTiles,
  disposeZoneTileAssets,
  disposeZonedTileGroup,
  type ZoneTileAsset,
} from "./zoned-tiles";

const DEFAULT_TILE_SIZE = 1.35;
const DEFAULT_TILE_GAP = 0;
const DEFAULT_TILE_HEIGHT = 0.18;
const DEFAULT_FLOOR_COLOR = "#7a7a7a";
const DEFAULT_DRIFT_SPEED = 0;
const DEFAULT_STEER_SPEED = 4.25;
const DEFAULT_VERTICAL_STEER_SPEED = 2.5;
const DEFAULT_BOB_AMPLITUDE = 0.08;
const DEFAULT_BOB_SPEED = 0.45;
const MIN_FLIGHT_HEIGHT = 1.8;
const MAX_FLIGHT_HEIGHT = 16;

export interface VisioTechnologicaState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  sky: THREE.Mesh;
  tiles: THREE.InstancedMesh;
  zonedTiles: THREE.Group;
  zoneTileAssets: ZoneTileAsset[];
  tileMaterial: THREE.MeshStandardMaterial;
  keyboardControls: KeyboardCameraControls;
  keyboardControlsActive: boolean;
  tileSize: number;
  tileGap: number;
  tileHeight: number;
  floorColor: string;
  steeringPitch: number;
  steeringRoll: number;
  driftSpeed: number;
  steerSpeed: number;
  verticalSteerSpeed: number;
  bobAmplitude: number;
  bobSpeed: number;
  flightHeight: number;
}

export async function setup(
  ctx: SetupContext,
): Promise<VisioTechnologicaState> {
  const keyboardControls = createKeyboardCameraControls(ctx.camera);
  const sky = createSky({
    radius: 700,
    detail: 3,
    colorTop: 0xc7d1da,
    colorHorizon: 0xf4f1ea,
    colorBottom: 0xb9c4cd,
  });
  ctx.scene.add(sky);

  const tileMaterial = new THREE.MeshStandardMaterial({
    color: DEFAULT_FLOOR_COLOR,
    roughness: 0.95,
    metalness: 0.05,
  });

  const tiles = createHexFloor(
    HEX_RADIUS,
    DEFAULT_TILE_SIZE,
    DEFAULT_TILE_GAP,
    DEFAULT_TILE_HEIGHT,
    tileMaterial,
  );

  const { assets: zoneTileAssets, group: zonedTiles } = await createZonedTiles(
    HEX_RADIUS,
    DEFAULT_TILE_SIZE,
    DEFAULT_TILE_GAP,
    DEFAULT_TILE_HEIGHT,
  );
  ctx.scene.add(zonedTiles);

  return {
    camera: ctx.camera,
    sky,
    tiles,
    zonedTiles,
    zoneTileAssets,
    tileMaterial,
    keyboardControls,
    keyboardControlsActive: true,
    tileSize: DEFAULT_TILE_SIZE,
    tileGap: DEFAULT_TILE_GAP,
    tileHeight: DEFAULT_TILE_HEIGHT,
    floorColor: DEFAULT_FLOOR_COLOR,
    steeringPitch: 0,
    steeringRoll: 0,
    driftSpeed: DEFAULT_DRIFT_SPEED,
    steerSpeed: DEFAULT_STEER_SPEED,
    verticalSteerSpeed: DEFAULT_VERTICAL_STEER_SPEED,
    bobAmplitude: DEFAULT_BOB_AMPLITUDE,
    bobSpeed: DEFAULT_BOB_SPEED,
    flightHeight: ctx.camera.position.y,
  };
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
  const s = state as VisioTechnologicaState;

  if (s.keyboardControlsActive) {
    updateKeyboardCameraControls(s.keyboardControls, s.camera, ctx.delta);
    s.flightHeight = s.camera.position.y;
  } else {
    s.camera.position.z -= s.driftSpeed * ctx.delta;
    s.camera.position.x += s.steeringRoll * s.steerSpeed * ctx.delta;
    s.flightHeight = THREE.MathUtils.clamp(
      s.flightHeight + s.steeringPitch * s.verticalSteerSpeed * ctx.delta,
      MIN_FLIGHT_HEIGHT,
      MAX_FLIGHT_HEIGHT,
    );
    s.camera.position.y =
      s.flightHeight + Math.sin(ctx.elapsed * s.bobSpeed) * s.bobAmplitude;
  }

  s.sky.position.copy(s.camera.position);

  return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as VisioTechnologicaState;

  disposeKeyboardCameraControls(s.keyboardControls);
  disposeHexFloor(s.tiles, scene);
  disposeZonedTileGroup(s.zonedTiles, scene);
  disposeZoneTileAssets(s.zoneTileAssets);
  s.tileMaterial.dispose();

  s.sky.geometry.dispose();
  if (s.sky.material instanceof THREE.Material) {
    s.sky.material.dispose();
  }
  scene.remove(s.sky);
}
