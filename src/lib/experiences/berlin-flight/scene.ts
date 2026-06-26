import * as THREE from "three";
import { Scheduler } from "3d-tiles-renderer";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { setBerlinDebugEnabled } from "./debug/controller";
import { BERLIN_DEBUG_OVERLAY_DEFAULT } from "./debug/config";
import {
  BERLIN_ALTITUDE_SPEED,
  BERLIN_FLIGHT_BASE_SPEED,
} from "./constants";
import { disposeObjectTree } from "./runtime/cleanup";
import { BerlinConeGridRuntime } from "./runtime/cone-grid-runtime";
import { BerlinCollisionController } from "./collision/controller";
import { BerlinConePlacementController } from "./cone-placement/controller";
import { BerlinPlacementController } from "./placement/controller";
import { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import { FlightPlayer } from "$lib/three/player";
import { CAMERA } from "$lib/config/flight";

const TILE_SELECTION_FOV = 110;
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

function createBerlinFillLights(): {
  directional: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
} {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xa0a0a0, 0.95);

  const directional = new THREE.DirectionalLight(0xffffff, 0.65);
  directional.position.set(-160, 90, -120);

  return { directional, hemisphere };
}

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

  const fillLights = createBerlinFillLights();
  sceneRoot.add(fillLights.hemisphere);
  sceneRoot.add(fillLights.directional);

  const coneRuntime = new BerlinConeGridRuntime();
  sceneRoot.add(coneRuntime.root);
  const collisionController = new BerlinCollisionController();
  const placementController = new BerlinPlacementController();
  const conePlacementController = new BerlinConePlacementController();
  const tileSelectionCamera = new THREE.PerspectiveCamera(
    Math.max(player.camera.fov, TILE_SELECTION_FOV),
    player.camera.aspect || 1,
    player.camera.near,
    player.camera.far,
  );
  tileSelectionCamera.updateProjectionMatrix();

  // Initial state
  const state: BerlinState = {
    sceneRoot,
    fillLights,
    tilesRuntime: null,
    tilesGroup,
    coneRuntime,
    collisionController,
    placementController,
    conePlacementController,
    renderer: ctx.renderer,
    camera: player.camera,
    tileSelectionCamera,
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
  s.player.setXRPresenting(s.renderer.xr.isPresenting);
  s.player.tick(ctx.delta);
  s.player.rig.updateMatrixWorld(true);

  if (s.tilesRuntime) {
    // Sync the WebXR session with the 3D Tiles scheduler so that requestAnimationFrame callbacks
    // (used for priority queue loading) run on the WebXR render loop rather than getting throttled.
    const xrSession = s.renderer.xr.getSession();
    Scheduler.setXRSession(xrSession as XRSession);

    syncTileSelectionCamera(s);
    s.tilesRuntime.update([s.tileSelectionCamera], s.renderer);
    s.placementController.update(
      s.player.rig.position,
      s.tilesRuntime.getTrackedTileMeshes(),
      s.tilesRuntime.getTrackedTileMeshVersion(),
    );
    s.conePlacementController.update(
      s.placementController.getAcceptedPoints(),
      s.tilesRuntime.getTrackedTileMeshes(),
      s.tilesRuntime.getTrackedTileMeshVersion(),
    );
    s.coneRuntime.setActiveCones(
      s.conePlacementController.getActiveCones(),
      s.conePlacementController.getSnapshotVersion(),
    );
    s.collisionController.update(
      s.coneRuntime.getActiveCones(),
      s.coneRuntime.getSnapshotVersion(),
      s.tilesRuntime.getTrackedTileMeshes(),
      s.tilesRuntime.getTrackedTileMeshVersion(),
    );
  }

  s.coneRuntime.update(s.player.rig.position);

  if (s.debugEnabled) {
    s.debugOverlay?.update(s, ctx.elapsed);
  }

  return { state: s };
}

async function loadTilesWhenConfigured(state: BerlinState): Promise<void> {
  if (!TilesRuntimeAdapter.isSourceConfigured()) {
    state.isLoading = false;
    return;
  }

  try {
    const runtime = await TilesRuntimeAdapter.create(
      state.tilesGroup,
      state.abortController.signal,
    );
    if (state.isDisposed || state.abortController.signal.aborted) {
      runtime.dispose();
      return;
    }

    state.tilesRuntime = runtime;
    state.isLoading = false;
  } catch (error) {
    if (state.isDisposed || state.abortController.signal.aborted) return;

    console.error("[BerlinFlight] Failed to load tileset:", error);
    state.isLoading = false;
  }
}

function syncTileSelectionCamera(state: BerlinState): void {
  const viewCamera = getTileSelectionViewCamera(state);
  const tileSelectionCamera = state.tileSelectionCamera;

  viewCamera.matrixWorld.decompose(
    scratchPosition,
    scratchQuaternion,
    scratchScale,
  );

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
  return state.renderer.xr.getCamera();
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
  s.coneRuntime.dispose();
  s.conePlacementController.dispose();
  s.placementController.dispose();

  s.fillLights.hemisphere.removeFromParent();
  s.fillLights.directional.removeFromParent();

  s.sceneRoot.removeFromParent();
  disposeObjectTree(s.sceneRoot);
  s.sceneRoot.clear();
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
