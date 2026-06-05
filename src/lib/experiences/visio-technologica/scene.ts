import * as THREE from "three";
import { loadGLTF } from "$lib/three/loader";
import { createSky } from "$lib/three/sky";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import {
  createKeyboardCameraControls,
  disposeKeyboardCameraControls,
  updateKeyboardCameraControls,
  type KeyboardCameraControls,
} from "./keyboard-camera-controls";

const DEFAULT_FLOOR_COLOR = "#7a7a7a";
const DEFAULT_DRIFT_SPEED = 0;
const DEFAULT_STEER_SPEED = 4.25;
const DEFAULT_VERTICAL_STEER_SPEED = 2.5;
const DEFAULT_BOB_AMPLITUDE = 0.08;
const DEFAULT_BOB_SPEED = 0.45;
const WORLD_CAMERA_HEIGHT_OFFSET = 40;
const WORLD_CAMERA_DISTANCE_OFFSET = 80;
const WORLD_LOOK_AT_HEIGHT = 12;
const WORLD_ROTATION_X = -Math.PI / 2;
const WORLD_ROOT_NAME = "visio-technologica-world";
const DEFERRED_WORLD_TILE_BATCH_SIZE = 1;
const DEFERRED_WORLD_TILE_SCHEDULE_DELAY_MS = 0;
const LOG_WORLD_TILE_STREAMING_PROGRESS = true;
const DEBUG_OVERLAY_CANVAS_WIDTH = 320;
const DEBUG_OVERLAY_CANVAS_HEIGHT = 96;
const DEBUG_OVERLAY_DISTANCE = -1.25;
const DEBUG_OVERLAY_OFFSET_X = -0.72;
const DEBUG_OVERLAY_OFFSET_Y = 0.42;
const DEBUG_OVERLAY_SCALE_X = 0.72;
const DEBUG_OVERLAY_SCALE_Y = 0.22;

const WORLD_TILE_FILES = [
  "Mesh_3887_58193_-002.glb",
  "Mesh_3887_58196_-002.glb",
  "Mesh_3887_58200_-002.glb",
  "Mesh_3887_58203_-002.glb",
  "Mesh_3890_58193_-002.glb",
  "Mesh_3890_58196_-002.glb",
  "Mesh_3890_58200_-002.glb",
  "Mesh_3890_58203_-002.glb",
  "Mesh_3890_58207_-002.glb",
  "Mesh_3894_58196_-002.glb",
  "Mesh_3894_58200_-002.glb",
  "Mesh_3894_58203_-002.glb",
  "Mesh_3894_58207_-002.glb",
  "Mesh_3898_58196_-002.glb",
  "Mesh_3898_58200_-002.glb",
  "Mesh_3898_58203_-002.glb",
  "Mesh_3898_58207_-002.glb",
] as const;

type WorldTileFile = (typeof WORLD_TILE_FILES)[number];

interface WorldTileGridCoordinate {
  x: number;
  y: number;
}

const STARTER_WORLD_TILE_FILES: readonly WorldTileFile[] = [
  "Mesh_3890_58200_-002.glb",
  "Mesh_3890_58203_-002.glb",
  "Mesh_3894_58200_-002.glb",
  "Mesh_3894_58203_-002.glb",
];

const STARTER_WORLD_TILE_FILE_SET = new Set<WorldTileFile>(
  STARTER_WORLD_TILE_FILES,
);

const DEFERRED_WORLD_TILE_FILES: readonly WorldTileFile[] =
  WORLD_TILE_FILES.filter(
    (fileName): fileName is WorldTileFile =>
      !STARTER_WORLD_TILE_FILE_SET.has(fileName),
  );

export interface VisioTechnologicaState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  sky: THREE.Mesh;
  floorColor: string;
  keyboardControls: KeyboardCameraControls;
  keyboardControlsActive: boolean;
  steeringPitch: number;
  steeringRoll: number;
  driftSpeed: number;
  steerSpeed: number;
  verticalSteerSpeed: number;
  bobAmplitude: number;
  bobSpeed: number;
  flightHeight: number;
  world: THREE.Group;
  debugOverlay: THREE.Sprite;
  debugOverlayTexture: THREE.CanvasTexture;
  totalWorldTileCount: number;
  loadedWorldTileCount: number;
  remainingWorldTileCount: number;
  starterWorldTileCount: number;
  deferredWorldTileFiles: readonly WorldTileFile[];
  deferredWorldTileLoadPromise: Promise<void> | null;
  deferredWorldTileScheduleHandle: ReturnType<typeof setTimeout> | null;
  deferredWorldTileScheduleResolve: (() => void) | null;
  isDisposed: boolean;
}

export async function setup(
  ctx: SetupContext,
): Promise<VisioTechnologicaState> {
  const world = new THREE.Group();
  world.name = WORLD_ROOT_NAME;
  ctx.scene.add(world);

  const sky = createSky({
    radius: 700,
    detail: 3,
    colorTop: 0xc7d1da,
    colorHorizon: 0xf4f1ea,
    colorBottom: 0xb9c4cd,
  });
  ctx.scene.add(sky);

  const starterTileEntries = await Promise.all(
    STARTER_WORLD_TILE_FILES.map((fileName) => loadWorldTile(fileName)),
  );
  const starterModels = starterTileEntries.map((entry) => entry.model);
  const nativeBounds = getWorldBounds(starterModels);
  const nativeOrigin = getWorldNativeOrigin(nativeBounds);
  const starterGridAnchor = getStarterGridAnchor(STARTER_WORLD_TILE_FILES);
  const starterWorldAnchor = getStarterWorldAnchor(nativeOrigin);
  const tileWorldStep = getTileWorldStep(starterTileEntries);

  addWorldModels(
    world,
    starterTileEntries,
    nativeOrigin,
    starterGridAnchor,
    starterWorldAnchor,
    tileWorldStep,
  );
  world.rotation.x = WORLD_ROTATION_X;

  const worldBounds = new THREE.Box3().setFromObject(world);
  positionCamera(ctx.camera, worldBounds);

  const keyboardControls = createKeyboardCameraControls(ctx.camera);
  const debugOverlay = createWorldTileDebugOverlay(ctx.camera);

  const starterWorldTileCount = starterModels.length;
  const totalWorldTileCount = WORLD_TILE_FILES.length;

  const state: VisioTechnologicaState = {
    camera: ctx.camera,
    sky,
    floorColor: DEFAULT_FLOOR_COLOR,
    keyboardControls,
    keyboardControlsActive: true,
    steeringPitch: 0,
    steeringRoll: 0,
    driftSpeed: DEFAULT_DRIFT_SPEED,
    steerSpeed: DEFAULT_STEER_SPEED,
    verticalSteerSpeed: DEFAULT_VERTICAL_STEER_SPEED,
    bobAmplitude: DEFAULT_BOB_AMPLITUDE,
    bobSpeed: DEFAULT_BOB_SPEED,
    flightHeight: ctx.camera.position.y,
    world,
    debugOverlay: debugOverlay.sprite,
    debugOverlayTexture: debugOverlay.texture,
    totalWorldTileCount,
    loadedWorldTileCount: starterWorldTileCount,
    remainingWorldTileCount: totalWorldTileCount - starterWorldTileCount,
    starterWorldTileCount,
    deferredWorldTileFiles: DEFERRED_WORLD_TILE_FILES,
    deferredWorldTileLoadPromise: null,
    deferredWorldTileScheduleHandle: null,
    deferredWorldTileScheduleResolve: null,
    isDisposed: false,
  };

  updateWorldTileDebugOverlay(state, "starter");
  logWorldTileStreamingProgress(state, "starter tiles ready");

  state.deferredWorldTileLoadPromise = loadDeferredWorldTiles(
    state,
    nativeOrigin,
    starterGridAnchor,
    starterWorldAnchor,
    tileWorldStep,
  ).catch((error: unknown) => {
    console.error("Failed to load deferred Visio Technologica tiles", error);
  });

  return state;
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
  const s = state as VisioTechnologicaState;

  if (s.keyboardControlsActive) {
    updateKeyboardCameraControls(s.keyboardControls, s.camera, ctx.delta);
  }

  s.flightHeight = s.camera.position.y;
  s.sky.position.copy(s.camera.position);

  return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as VisioTechnologicaState;
  s.isDisposed = true;
  clearDeferredWorldTileSchedule(s);

  disposeKeyboardCameraControls(s.keyboardControls);
  disposeWorldTileDebugOverlay(s);
  disposeWorld(s.world, scene);

  s.sky.geometry.dispose();
  if (s.sky.material instanceof THREE.Material) {
    s.sky.material.dispose();
  }
  scene.remove(s.sky);
}

async function loadWorldTile(
  fileName: WorldTileFile,
): Promise<{ fileName: WorldTileFile; model: THREE.Group }> {
  const url = new URL(`./static/${fileName}`, import.meta.url).href;
  const gltf = await loadGLTF(url);
  const model = gltf.scene;
  model.name = fileName.replace(/\.glb$/u, "");
  prepareWorldModel(model);
  return { fileName, model };
}

async function loadDeferredWorldTiles(
  state: VisioTechnologicaState,
  nativeOrigin: THREE.Vector3,
  starterGridAnchor: WorldTileGridCoordinate,
  starterWorldAnchor: THREE.Vector3,
  tileWorldStep: THREE.Vector3,
): Promise<void> {
  const remainingWorldTileFiles = [...state.deferredWorldTileFiles];

  while (remainingWorldTileFiles.length > 0) {
    await waitForDeferredWorldTileTurn(state);
    if (state.isDisposed) {
      return;
    }

    const batchTileFiles = remainingWorldTileFiles.splice(
      0,
      DEFERRED_WORLD_TILE_BATCH_SIZE,
    );
    const models = await Promise.all(
      batchTileFiles.map((fileName) => loadWorldTile(fileName)),
    );

    if (state.isDisposed) {
      for (const entry of models) {
        disposeWorldModel(entry.model);
      }
      return;
    }

    addWorldModels(
      state.world,
      models,
      nativeOrigin,
      starterGridAnchor,
      starterWorldAnchor,
      tileWorldStep,
    );
    state.loadedWorldTileCount += models.length;
    state.remainingWorldTileCount =
      state.totalWorldTileCount - state.loadedWorldTileCount;
    updateWorldTileDebugOverlay(state, "streaming");
    logWorldTileStreamingProgress(state, "deferred tiles streamed");
  }
}

function waitForDeferredWorldTileTurn(
  state: VisioTechnologicaState,
): Promise<void> {
  return new Promise((resolve) => {
    state.deferredWorldTileScheduleResolve = resolve;
    state.deferredWorldTileScheduleHandle = setTimeout(() => {
      state.deferredWorldTileScheduleHandle = null;
      const scheduledResolve = state.deferredWorldTileScheduleResolve;
      state.deferredWorldTileScheduleResolve = null;
      scheduledResolve?.();
    }, DEFERRED_WORLD_TILE_SCHEDULE_DELAY_MS);
  });
}

function clearDeferredWorldTileSchedule(state: VisioTechnologicaState): void {
  if (state.deferredWorldTileScheduleHandle !== null) {
    clearTimeout(state.deferredWorldTileScheduleHandle);
    state.deferredWorldTileScheduleHandle = null;
  }

  const scheduledResolve = state.deferredWorldTileScheduleResolve;
  state.deferredWorldTileScheduleResolve = null;
  scheduledResolve?.();
}

function getWorldTileGridCoordinate(
  fileName: WorldTileFile,
): WorldTileGridCoordinate {
  const match = /Mesh_(\d+)_(\d+)_-?\d+\.glb$/u.exec(fileName);
  if (!match) {
    throw new Error(`Invalid Visio Technologica tile name: ${fileName}`);
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

function getStarterGridAnchor(
  starterTileFiles: readonly WorldTileFile[],
): WorldTileGridCoordinate {
  let xSum = 0;
  let ySum = 0;

  for (const fileName of starterTileFiles) {
    const coordinate = getWorldTileGridCoordinate(fileName);
    xSum += coordinate.x;
    ySum += coordinate.y;
  }

  return {
    x: xSum / starterTileFiles.length,
    y: ySum / starterTileFiles.length,
  };
}

function getStarterWorldAnchor(nativeOrigin: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-nativeOrigin.x, -nativeOrigin.y, -nativeOrigin.z);
}

function getTileWorldStep(
  tileEntries: readonly { fileName: WorldTileFile; model: THREE.Object3D }[],
): THREE.Vector3 {
  const averageTileSize = getAverageWorldTileSize(tileEntries);
  const gridStep = getStarterGridStep(
    tileEntries.map((entry) => entry.fileName),
  );

  return new THREE.Vector3(
    averageTileSize.x / gridStep.x,
    averageTileSize.y / gridStep.y,
    0,
  );
}

function getAverageWorldTileSize(
  tileEntries: readonly { fileName: WorldTileFile; model: THREE.Object3D }[],
): THREE.Vector2 {
  const totalSize = new THREE.Vector2();

  for (const entry of tileEntries) {
    const size = new THREE.Box3()
      .setFromObject(entry.model)
      .getSize(new THREE.Vector3());
    totalSize.x += size.x;
    totalSize.y += size.y;
  }

  return totalSize.divideScalar(tileEntries.length);
}

function getStarterGridStep(
  starterTileFiles: readonly WorldTileFile[],
): THREE.Vector2 {
  const xCoordinates = [
    ...new Set(
      starterTileFiles.map(
        (fileName) => getWorldTileGridCoordinate(fileName).x,
      ),
    ),
  ].sort((left, right) => left - right);
  const yCoordinates = [
    ...new Set(
      starterTileFiles.map(
        (fileName) => getWorldTileGridCoordinate(fileName).y,
      ),
    ),
  ].sort((left, right) => left - right);

  return new THREE.Vector2(
    getSmallestPositiveGridDelta(xCoordinates),
    getSmallestPositiveGridDelta(yCoordinates),
  );
}

function getSmallestPositiveGridDelta(values: readonly number[]): number {
  let smallestPositiveDelta = Number.POSITIVE_INFINITY;

  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta > 0 && delta < smallestPositiveDelta) {
      smallestPositiveDelta = delta;
    }
  }

  if (!Number.isFinite(smallestPositiveDelta)) {
    throw new Error("Unable to derive Visio Technologica tile grid spacing");
  }

  return smallestPositiveDelta;
}

function getWorldBounds(models: readonly THREE.Object3D[]): THREE.Box3 {
  const bounds = new THREE.Box3();

  for (const model of models) {
    bounds.union(new THREE.Box3().setFromObject(model));
  }

  return bounds;
}

function getWorldNativeOrigin(nativeBounds: THREE.Box3): THREE.Vector3 {
  const nativeCenter = nativeBounds.getCenter(new THREE.Vector3());
  return new THREE.Vector3(nativeCenter.x, nativeCenter.y, nativeBounds.min.z);
}

function addWorldModels(
  world: THREE.Group,
  tileEntries: readonly { fileName: WorldTileFile; model: THREE.Object3D }[],
  nativeOrigin: THREE.Vector3,
  starterGridAnchor: WorldTileGridCoordinate,
  starterWorldAnchor: THREE.Vector3,
  tileWorldStep: THREE.Vector3,
): void {
  for (const entry of tileEntries) {
    const tileGridCoordinate = getWorldTileGridCoordinate(entry.fileName);
    positionWorldTile(
      entry.model,
      nativeOrigin,
      tileGridCoordinate,
      starterGridAnchor,
      starterWorldAnchor,
      tileWorldStep,
    );
    world.add(entry.model);
  }
}

function prepareWorldModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = true;

    if (child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    }
  });
}

function positionWorldTile(
  model: THREE.Object3D,
  nativeOrigin: THREE.Vector3,
  tileGridCoordinate: WorldTileGridCoordinate,
  starterGridAnchor: WorldTileGridCoordinate,
  starterWorldAnchor: THREE.Vector3,
  tileWorldStep: THREE.Vector3,
): void {
  const gridOffsetX = tileGridCoordinate.x - starterGridAnchor.x;
  const gridOffsetY = tileGridCoordinate.y - starterGridAnchor.y;

  model.position.set(
    starterWorldAnchor.x + tileWorldStep.x * gridOffsetX,
    starterWorldAnchor.y + tileWorldStep.y * gridOffsetY,
    -nativeOrigin.z,
  );
}

function positionCamera(
  camera: THREE.PerspectiveCamera,
  worldBounds: THREE.Box3,
): void {
  const center = worldBounds.getCenter(new THREE.Vector3());
  const size = worldBounds.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(size.x, size.z);

  camera.position.set(
    center.x,
    worldBounds.max.y + WORLD_CAMERA_HEIGHT_OFFSET,
    center.z + horizontalSpan * 0.5 + WORLD_CAMERA_DISTANCE_OFFSET,
  );
  camera.lookAt(center.x, center.y + WORLD_LOOK_AT_HEIGHT, center.z);
}

function disposeWorld(world: THREE.Group, scene: THREE.Scene): void {
  world.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();
    disposeMaterial(child.material);
  });

  scene.remove(world);
}

function createWorldTileDebugOverlay(camera: THREE.PerspectiveCamera): {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = DEBUG_OVERLAY_CANVAS_WIDTH;
  canvas.height = DEBUG_OVERLAY_CANVAS_HEIGHT;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0, 1);
  sprite.position.set(
    DEBUG_OVERLAY_OFFSET_X,
    DEBUG_OVERLAY_OFFSET_Y,
    DEBUG_OVERLAY_DISTANCE,
  );
  sprite.scale.set(DEBUG_OVERLAY_SCALE_X, DEBUG_OVERLAY_SCALE_Y, 1);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;

  camera.add(sprite);

  return { sprite, texture };
}

function updateWorldTileDebugOverlay(
  state: VisioTechnologicaState,
  phase: "starter" | "streaming",
): void {
  const canvas = state.debugOverlayTexture.image;
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#000000";
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  context.fillStyle = "#000000";
  context.font = "bold 24px sans-serif";
  context.fillText("Visio tiles", 16, 30);

  context.font = "20px sans-serif";
  context.fillText(
    `${state.loadedWorldTileCount}/${state.totalWorldTileCount} loaded`,
    16,
    58,
  );
  context.fillText(`${state.remainingWorldTileCount} remaining`, 16, 82);

  context.textAlign = "right";
  context.fillStyle = "#000000";
  context.fillText(phase === "starter" ? "starter" : "streaming", 304, 82);
  context.textAlign = "start";

  state.debugOverlayTexture.needsUpdate = true;
}

function disposeWorldTileDebugOverlay(state: VisioTechnologicaState): void {
  state.camera.remove(state.debugOverlay);
  state.debugOverlayTexture.dispose();
  if (state.debugOverlay.material instanceof THREE.Material) {
    state.debugOverlay.material.dispose();
  }
}

function logWorldTileStreamingProgress(
  state: VisioTechnologicaState,
  phase: string,
): void {
  if (!LOG_WORLD_TILE_STREAMING_PROGRESS) {
    return;
  }

  console.info(
    `[Visio Technologica] ${phase}: ${state.loadedWorldTileCount}/${state.totalWorldTileCount} tiles loaded, ${state.remainingWorldTileCount} remaining`,
  );
}

function disposeWorldModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();
    disposeMaterial(child.material);
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      disposeMaterial(item);
    }
    return;
  }

  const materialWithMap = material as THREE.Material & {
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

  materialWithMap.map?.dispose();
  materialWithMap.alphaMap?.dispose();
  materialWithMap.aoMap?.dispose();
  materialWithMap.bumpMap?.dispose();
  materialWithMap.displacementMap?.dispose();
  materialWithMap.emissiveMap?.dispose();
  materialWithMap.lightMap?.dispose();
  materialWithMap.metalnessMap?.dispose();
  materialWithMap.normalMap?.dispose();
  materialWithMap.roughnessMap?.dispose();
  materialWithMap.specularMap?.dispose();
  material.dispose();
}
