import * as THREE from "three";
import { Scheduler } from "3d-tiles-renderer";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { setBerlinDebugEnabled } from "./debug/controller";
import { BERLIN_DEBUG_OVERLAY_DEFAULT } from "./debug/config";
import { preloadBerlinCameraDensitySampler } from "./heatmaps/camera-density-loader";
import {
  BERLIN_ALTITUDE_SPEED,
  BERLIN_FLIGHT_BASE_SPEED,
  BERLIN_TILE_PRELOAD,
} from "./constants";
import { disposeObjectTree } from "./runtime/cleanup";
import { BerlinConeGridRuntime } from "./runtime/cone-grid-runtime";
import { BerlinCollisionController } from "./collision/controller";
import { BerlinConePlacementController } from "./cone-placement/controller";
import { BerlinPlacementController } from "./placement/controller";
import { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import {
  isBerlinTilesSourceConfigured,
  resolveBerlinTilesSource,
} from "./runtime/tiles-source";
import { FlightPlayer } from "$lib/three/player";
import { CAMERA } from "$lib/config/flight";

const TILE_SELECTION_FOV = 110;
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchForward = new THREE.Vector3();

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
  await preloadBerlinCameraDensitySampler();

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
  const tilePreloadCamera = new THREE.PerspectiveCamera(
    Math.max(player.camera.fov, BERLIN_TILE_PRELOAD.FOV),
    player.camera.aspect || 1,
    player.camera.near,
    player.camera.far,
  );
  tileSelectionCamera.updateProjectionMatrix();
  tilePreloadCamera.updateProjectionMatrix();

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
    tilePreloadCamera,
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

    syncTileSelectionCameras(s);
    // ponytail: preload camera stays disabled until tile budgets are retuned for it;
    // it competes with the visible camera for refinement work.
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
  if (!isBerlinTilesSourceConfigured()) {
    state.isLoading = false;
    return;
  }

  try {
    const source = await resolveBerlinTilesSource();
    const runtime = await TilesRuntimeAdapter.create(
      state.tilesGroup,
      source,
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

function syncTileSelectionCameras(state: BerlinState): void {
  const viewCamera = getTileSelectionViewCamera(state);

  viewCamera.matrixWorld.decompose(
    scratchPosition,
    scratchQuaternion,
    scratchScale,
  );

  syncTileSelectionCamera(
    state.tileSelectionCamera,
    scratchPosition,
    scratchQuaternion,
    Math.max(state.camera.fov, TILE_SELECTION_FOV),
    state,
  );

  scratchForward.set(0, 0, -1).applyQuaternion(scratchQuaternion).normalize();
  scratchPosition.addScaledVector(
    scratchForward,
    BERLIN_TILE_PRELOAD.AHEAD_DISTANCE,
  );
  syncTileSelectionCamera(
    state.tilePreloadCamera,
    scratchPosition,
    scratchQuaternion,
    Math.max(state.camera.fov, BERLIN_TILE_PRELOAD.FOV),
    state,
  );
}

function syncTileSelectionCamera(
  camera: THREE.PerspectiveCamera,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  fov: number,
  state: BerlinState,
): void {
  camera.position.copy(position);
  camera.quaternion.copy(quaternion);

  const nextAspect = state.camera.aspect || 1;
  if (
    camera.near !== state.camera.near ||
    camera.far !== state.camera.far ||
    camera.fov !== fov ||
    camera.aspect !== nextAspect
  ) {
    camera.near = state.camera.near;
    camera.far = state.camera.far;
    camera.fov = fov;
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  }

  camera.updateMatrixWorld(true);
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
