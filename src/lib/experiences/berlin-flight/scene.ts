import * as THREE from "three";
import { Scheduler } from "3d-tiles-renderer";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import {
  resolveBerlinTileset,
  isSourceConfigured,
} from "./runtime/tiles-source";
import { setBerlinDebugEnabled } from "./debug/controller";
import { BERLIN_DEBUG_OVERLAY_DEFAULT } from "./debug/config";
import {
  BERLIN_ALTITUDE_SPEED,
  BERLIN_FLIGHT_BASE_SPEED,
} from "./constants";
import { BERLIN_MITTE_ORIGIN, getECEFToLocalMatrix } from "./geo";
import { disposeObjectTree } from "./runtime/cleanup";
import { FlightPlayer } from "$lib/three/player";
import { CAMERA } from "$lib/config/flight";

const TILE_SELECTION_FOV = 110;
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

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

  const gridHelper = new THREE.GridHelper(2000, 100);
  gridHelper.position.y = -1;
  sceneRoot.add(gridHelper);

  // Initial state
  const state: BerlinState = {
    sceneRoot,
    tilesRuntime: null,
    tilesGroup,
    renderer: ctx.renderer,
    camera: player.camera,
    tileSelectionCamera: createTileSelectionCamera(player.camera),
    player,
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
  s.player.rig.updateMatrixWorld(true);

  if (s.tilesRuntime) {
    // Sync the WebXR session with the 3D Tiles scheduler so that requestAnimationFrame callbacks
    // (used for priority queue loading) run on the WebXR render loop rather than getting throttled.
    const xrSession = s.renderer.xr.getSession();
    Scheduler.setXRSession(xrSession as XRSession);

    syncTileSelectionCamera(s);
    s.tilesRuntime.update(getTileSelectionCameras(s), s.renderer);
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

  s.sceneRoot.removeFromParent();
  disposeObjectTree(s.sceneRoot);
  s.sceneRoot.clear();
}

function getTileSelectionCameras(state: BerlinState): readonly THREE.Camera[] {
  return [state.tileSelectionCamera];
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

    const runtime = new TilesRuntimeAdapter(url, token);
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

function createTileSelectionCamera(
  referenceCamera: THREE.PerspectiveCamera,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    Math.max(referenceCamera.fov, TILE_SELECTION_FOV),
    referenceCamera.aspect || 1,
    referenceCamera.near,
    referenceCamera.far,
  );
  camera.updateProjectionMatrix();
  return camera;
}

function syncTileSelectionCamera(state: BerlinState): void {
  const viewCamera = getTileSelectionViewCamera(state);
  const tileSelectionCamera = state.tileSelectionCamera;

  // Extract the actual world position and rotation from the viewCamera (supporting headset tracking offset)
  viewCamera.matrixWorld.decompose(scratchPosition, scratchQuaternion, scratchScale);

  tileSelectionCamera.position.copy(scratchPosition);
  tileSelectionCamera.quaternion.copy(scratchQuaternion);

  const nextFov = Math.max(state.camera.fov, TILE_SELECTION_FOV);
  const nextAspect = state.camera.aspect || 1;
  if (
    tileSelectionCamera.near !== state.camera.near ||
    tileSelectionCamera.far !== state.camera.far ||
    tileSelectionCamera.fov !== nextFov ||
    tileSelectionCamera.aspect !== nextAspect
  ) {
    tileSelectionCamera.near = state.camera.near;
    tileSelectionCamera.far = state.camera.far;
    tileSelectionCamera.fov = nextFov;
    tileSelectionCamera.aspect = nextAspect;
    tileSelectionCamera.updateProjectionMatrix();
  }

  tileSelectionCamera.updateMatrixWorld(true);
}

function getTileSelectionViewCamera(state: BerlinState): THREE.Camera {
  if (!state.renderer.xr.isPresenting) {
    state.camera.updateMatrixWorld(true);
    return state.camera;
  }

  state.renderer.xr.updateCamera(state.camera);
  const xrCamera = state.renderer.xr.getCamera();
  // DO NOT call xrCamera.updateMatrixWorld(true) here!
  // WebXRManager already updates xrCamera's matrixWorld.
  // Calling updateMatrixWorld(true) on xrCamera would overwrite it with its local position/quaternion (which are 0/identity).
  return xrCamera;
}
