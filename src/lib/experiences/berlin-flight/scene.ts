import * as THREE from "three";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { createTilesRuntime } from "./runtime/tiles-runtime";
import {
  resolveBerlinTileset,
  isSourceConfigured,
} from "./runtime/tiles-source";
import { setBerlinDebugEnabled } from "./debug/controller";
import { BERLIN_DEBUG_OVERLAY_DEFAULT } from "./debug/config";
import {
  BERLIN_ALTITUDE_SPEED,
  BERLIN_FLIGHT_BASE_SPEED,
  BERLIN_TILE_REFINEMENT_CAMERA,
} from "./constants";
import { BERLIN_MITTE_ORIGIN, getECEFToLocalMatrix } from "./geo";
import { disposeObjectTree, removeFromParent } from "./runtime/cleanup";
import { FlightPlayer } from "$lib/three/player";
import { CAMERA } from "$lib/config/flight";

/**
 * Initializes the Berlin scene
 */
export async function setup(ctx: SetupContext): Promise<BerlinState> {
  const sceneRoot = new THREE.Group();
  sceneRoot.name = "BerlinFlightRoot";
  ctx.scene.add(sceneRoot);

  const tilesGroup = new THREE.Group();
  tilesGroup.name = "BerlinTilesRoot";
  sceneRoot.add(tilesGroup);

  // Player (creates own camera + rig)
  const player = new FlightPlayer({
    fov: CAMERA.FOV,
    near: CAMERA.NEAR,
    far: 10000, // Increased for city scale
    spawnPosition: { x: 0, y: 100, z: 0 },
    baseSpeed: BERLIN_FLIGHT_BASE_SPEED,
    terrainSlowdown: 1.0, // No terrain slowdown for tiles yet
  });
  sceneRoot.add(player.rig);

  const tilesCamera = new THREE.PerspectiveCamera(
    BERLIN_TILE_REFINEMENT_CAMERA.FOV,
    BERLIN_TILE_REFINEMENT_CAMERA.ASPECT,
    CAMERA.NEAR,
    10000,
  );

  const gridHelper = new THREE.GridHelper(2000, 100);
  gridHelper.position.y = -1;
  sceneRoot.add(gridHelper);

  // Initial state
  const state: BerlinState = {
    sceneRoot,
    tilesRuntime: null,
    tilesGroup,
    gridHelper,
    renderer: ctx.renderer,
    camera: player.camera,
    tilesCamera,
    player,
    latestOrientation: { pitch: 0, roll: 0 },
    speed: BERLIN_FLIGHT_BASE_SPEED,
    targetSpeed: BERLIN_FLIGHT_BASE_SPEED,
    isLoading: true,
    debugEnabled: false,
    debugOverlay: null,
    isDisposed: false,
    abortController: new AbortController(),
  };

  setBerlinDebugEnabled(state, BERLIN_DEBUG_OVERLAY_DEFAULT);
  void loadTilesWhenConfigured(state);

  return state;
}

/**
 * Updates the scene every frame
 */
export function tick(state: BerlinState, ctx: TickContext) {
  const s = state as BerlinState;

  if (s.isDisposed) {
    return { state: s };
  }

  s.player.baseSpeed = getAltitudeScaledSpeed(
    s.targetSpeed,
    s.player.rig.position.y,
  );
  s.player.tick(ctx.delta);
  s.speed = s.player.baseSpeed;
  s.camera.updateMatrixWorld(true);

  if (s.tilesRuntime) {
    syncTilesCamera(s);
    s.tilesRuntime.update(s.tilesCamera, s.renderer);
  }

  if (s.debugEnabled) {
    s.debugOverlay?.update(s, ctx.elapsed);
  }

  return { state: s };
}

/**
 * Cleans up resources
 */
export function dispose(state: BerlinState, _scene: THREE.Scene): void {
  const s = state as BerlinState;

  if (s.isDisposed) return;

  s.isDisposed = true;
  s.isLoading = false;
  s.abortController.abort();

  s.debugOverlay?.dispose();
  s.debugOverlay = null;

  s.tilesRuntime?.setVisible(false);
  s.tilesRuntime?.dispose();
  s.tilesRuntime = null;

  removeFromParent(s.sceneRoot);
  disposeObjectTree(s.sceneRoot);
  s.sceneRoot.clear();
}

function syncTilesCamera(state: BerlinState): void {
  const sourceCamera = getTilesCameraPoseSource(state);

  state.tilesCamera.fov = BERLIN_TILE_REFINEMENT_CAMERA.FOV;
  state.tilesCamera.aspect = BERLIN_TILE_REFINEMENT_CAMERA.ASPECT;
  state.tilesCamera.near = state.camera.near;
  state.tilesCamera.far = state.camera.far;
  state.tilesCamera.updateProjectionMatrix();
  state.tilesCamera.matrixWorld.copy(sourceCamera.matrixWorld);
  state.tilesCamera.matrixWorldInverse.copy(sourceCamera.matrixWorld).invert();
  state.tilesCamera.matrix.copy(sourceCamera.matrixWorld);
  state.tilesCamera.matrixAutoUpdate = false;
  state.tilesCamera.matrixWorld.decompose(
    state.tilesCamera.position,
    state.tilesCamera.quaternion,
    state.tilesCamera.scale,
  );
}

function getTilesCameraPoseSource(state: BerlinState): THREE.Camera {
  if (!state.renderer.xr.isPresenting) {
    state.camera.updateMatrixWorld(true);
    return state.camera;
  }

  state.renderer.xr.updateCamera(state.camera);
  const xrCamera = state.renderer.xr.getCamera();
  xrCamera.updateMatrixWorld(true);
  return xrCamera;
}

function getAltitudeScaledSpeed(baseSpeed: number, altitude: number): number {
  const altitudeRange =
    BERLIN_ALTITUDE_SPEED.MAX_ALTITUDE - BERLIN_ALTITUDE_SPEED.MIN_ALTITUDE;
  const normalizedAltitude = THREE.MathUtils.clamp(
    (altitude - BERLIN_ALTITUDE_SPEED.MIN_ALTITUDE) / altitudeRange,
    0,
    1,
  );
  const multiplier = THREE.MathUtils.lerp(
    BERLIN_ALTITUDE_SPEED.MIN_MULTIPLIER,
    BERLIN_ALTITUDE_SPEED.MAX_MULTIPLIER,
    normalizedAltitude,
  );

  return baseSpeed * multiplier;
}

async function loadTilesWhenConfigured(state: BerlinState): Promise<void> {
  if (!isSourceConfigured()) {
    state.isLoading = false;
    return;
  }

  try {
    const { url, token } = await resolveBerlinTileset();
    if (state.isDisposed || state.abortController.signal.aborted) return;

    console.log("[BerlinFlight] Resolved tileset URL:", url);
    console.log("[BerlinFlight] Token length:", token?.length ?? 0);

    const runtime = createTilesRuntime(url, token);
    state.tilesRuntime = runtime;

    const tiles = await runtime.loadTiles(
      state.tilesGroup,
      state.abortController.signal,
    );
    if (state.isDisposed || state.abortController.signal.aborted) {
      runtime.dispose();
      return;
    }

    const ltsMatrix = getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(ltsMatrix);
    tiles.group.updateMatrixWorld(true);

    console.log("[BerlinFlight] Tileset loaded and positioned.");
    state.isLoading = false;
  } catch (error) {
    if (state.isDisposed || state.abortController.signal.aborted) return;

    console.error("[BerlinFlight] Failed to load tileset:", error);
    state.isLoading = false;
  }
}
