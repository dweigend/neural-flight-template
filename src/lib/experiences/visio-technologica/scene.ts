import * as THREE from "three";
import { loadGLTF } from "$lib/three/loader";
import { createSky } from "$lib/three/sky";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { type ChunkDimensions, getChunkKey, type ChunkKey } from "./chunk-core";
import {
  VISIO_TILE_CHUNK_MANIFEST,
  type VisioTileChunkManifestEntry,
} from "./chunking";
import {
  createChunkViewHorizon,
  type ChunkViewHorizon,
  type WorldDirection,
} from "./chunk-horizon";
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
const WORLD_CAMERA_HEIGHT_OFFSET = 120;
const WORLD_CAMERA_DISTANCE_OFFSET = 240;
const WORLD_LOOK_AT_HEIGHT = 18;
const WORLD_ROTATION_X = -Math.PI / 2;
const WORLD_ROOT_NAME = "visio-technologica-world";
const WORLD_CHUNK_WORLD_SIZE = 180;
const WORLD_CHUNK_WORLD_HEIGHT = 140;
const MAX_VISIBLE_WORLD_TILE_CHUNKS = 6;
const MAX_CHUNK_LOADS_PER_TURN = 1;
const CHUNK_VIEW_DISTANCE = WORLD_CHUNK_WORLD_SIZE * 2.35;
const CHUNK_VIEW_EDGE_BUFFER_RADIANS = Math.PI / 12;
const CHUNK_VIEW_FADE_START_RATIO = 0.72;
const DEFERRED_WORLD_TILE_SCHEDULE_DELAY_MS = 0;
const LOG_WORLD_TILE_STREAMING_PROGRESS = true;
const DEBUG_OVERLAY_CANVAS_WIDTH = 320;
const DEBUG_OVERLAY_CANVAS_HEIGHT = 96;
const DEBUG_OVERLAY_DISTANCE = -1.25;
const DEBUG_OVERLAY_OFFSET_X = -0.72;
const DEBUG_OVERLAY_OFFSET_Y = 0.42;
const DEBUG_OVERLAY_SCALE_X = 0.72;
const DEBUG_OVERLAY_SCALE_Y = 0.22;

type WorldTileFile = VisioTileChunkManifestEntry["fileName"];
type WorldTileChunkStatus = "unloaded" | "loading" | "loaded" | "unloading";

interface WorldTilePlacementContext {
  assetNativeOrigin: THREE.Vector3;
  chunkDimensions: ChunkDimensions;
}

interface RuntimeChunkHorizonState {
  currentChunkKey: ChunkKey;
  desiredChunkKeys: readonly ChunkKey[];
  signature: string;
}

interface WorldTileChunkRuntimeState {
  manifestEntry: VisioTileChunkManifestEntry;
  status: WorldTileChunkStatus;
  model: THREE.Group | null;
  sceneWorldCenter: THREE.Vector3;
}

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
  chunkHorizon: RuntimeChunkHorizonState;
  tilePlacement: WorldTilePlacementContext;
  tileChunks: Map<WorldTileFile, WorldTileChunkRuntimeState>;
  chunkStreamingPending: boolean;
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
  world.rotation.x = WORLD_ROTATION_X;
  ctx.scene.add(world);

  const sky = createSky({
    radius: 700,
    detail: 3,
    colorTop: 0xc7d1da,
    colorHorizon: 0xf4f1ea,
    colorBottom: 0xb9c4cd,
  });
  ctx.scene.add(sky);

  const starterManifestEntries = VISIO_TILE_CHUNK_MANIFEST.starterEntries;
  if (starterManifestEntries.length === 0) {
    throw new Error(
      "Visio Technologica chunk manifest must provide at least one starter entry.",
    );
  }

  const starterTileEntries = await Promise.all(
    starterManifestEntries.map((entry) => loadWorldTile(entry.fileName)),
  );
  const tilePlacement = createWorldTilePlacementContext(
    starterTileEntries[0].model,
  );
  const tileChunks = createTileChunkRuntimeStates(
    starterTileEntries,
    tilePlacement,
    world,
  );

  world.updateMatrixWorld(true);
  positionCamera(ctx.camera, starterManifestEntries, tilePlacement);
  world.updateMatrixWorld(true);

  const keyboardControls = createKeyboardCameraControls(ctx.camera);
  const debugOverlay = createWorldTileDebugOverlay(ctx.camera);
  const currentHorizon = createCurrentChunkHorizon(
    ctx.camera,
    tilePlacement.chunkDimensions,
  );

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
    totalWorldTileCount: VISIO_TILE_CHUNK_MANIFEST.entries.length,
    loadedWorldTileCount: 0,
    remainingWorldTileCount: 0,
    starterWorldTileCount: starterManifestEntries.length,
    chunkHorizon: {
      currentChunkKey: getChunkKey(currentHorizon.currentChunkCoordinate),
      desiredChunkKeys: getDesiredVisibleChunkKeys(currentHorizon),
      signature: currentHorizon.signature,
    },
    tilePlacement,
    tileChunks,
    chunkStreamingPending: true,
    deferredWorldTileLoadPromise: null,
    deferredWorldTileScheduleHandle: null,
    deferredWorldTileScheduleResolve: null,
    isDisposed: false,
  };

  updateWorldTileCounts(state);
  updateWorldTileDebugOverlay(state, "starter");
  logWorldTileStreamingProgress(state, "starter tiles ready");
  scheduleChunkStreaming(state);

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

  if (updateChunkHorizonState(s)) {
    scheduleChunkStreaming(s);
  }

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

function createWorldTilePlacementContext(
  referenceModel: THREE.Object3D,
): WorldTilePlacementContext {
  return {
    assetNativeOrigin: getWorldModelNativeOrigin(referenceModel),
    chunkDimensions: {
      width: WORLD_CHUNK_WORLD_SIZE,
      height: WORLD_CHUNK_WORLD_HEIGHT,
      depth: WORLD_CHUNK_WORLD_SIZE,
    },
  };
}

function getWorldModelNativeOrigin(model: THREE.Object3D): THREE.Vector3 {
  const nativeBounds = new THREE.Box3().setFromObject(model);
  const nativeCenter = nativeBounds.getCenter(new THREE.Vector3());

  return new THREE.Vector3(nativeCenter.x, nativeCenter.y, nativeBounds.min.z);
}

function createTileChunkRuntimeStates(
  starterTileEntries: readonly {
    fileName: WorldTileFile;
    model: THREE.Group;
  }[],
  tilePlacement: WorldTilePlacementContext,
  world: THREE.Group,
): Map<WorldTileFile, WorldTileChunkRuntimeState> {
  const starterModelByFileName = new Map<WorldTileFile, THREE.Group>(
    starterTileEntries.map((entry) => [entry.fileName, entry.model]),
  );

  const chunks = new Map<WorldTileFile, WorldTileChunkRuntimeState>();
  for (const manifestEntry of VISIO_TILE_CHUNK_MANIFEST.entries) {
    const starterModel =
      starterModelByFileName.get(manifestEntry.fileName) ?? null;
    if (starterModel) {
      positionWorldTile(starterModel, manifestEntry, tilePlacement);
      world.add(starterModel);
    }

    chunks.set(manifestEntry.fileName, {
      manifestEntry,
      status: starterModel ? "loaded" : "unloaded",
      model: starterModel,
      sceneWorldCenter: getSceneWorldCenterForManifestEntry(
        manifestEntry,
        tilePlacement,
      ),
    });
  }

  return chunks;
}

function scheduleChunkStreaming(state: VisioTechnologicaState): void {
  state.chunkStreamingPending = true;

  if (state.deferredWorldTileLoadPromise !== null || state.isDisposed) {
    return;
  }

  state.deferredWorldTileLoadPromise = runChunkStreamingLoop(state)
    .catch((error: unknown) => {
      console.error("Failed to stream Visio Technologica tiles", error);
    })
    .finally(() => {
      state.deferredWorldTileLoadPromise = null;
      if (state.chunkStreamingPending && !state.isDisposed) {
        scheduleChunkStreaming(state);
      }
    });
}

async function runChunkStreamingLoop(
  state: VisioTechnologicaState,
): Promise<void> {
  while (!state.isDisposed) {
    if (!state.chunkStreamingPending) {
      return;
    }

    state.chunkStreamingPending = false;
    await waitForDeferredWorldTileTurn(state);
    if (state.isDisposed) {
      return;
    }

    const hasMoreWork = await reconcileChunkStreaming(state);
    if (hasMoreWork) {
      state.chunkStreamingPending = true;
    }
  }
}

async function reconcileChunkStreaming(
  state: VisioTechnologicaState,
): Promise<boolean> {
  const horizon = createCurrentChunkHorizon(
    state.camera,
    state.tilePlacement.chunkDimensions,
  );
  const desiredChunkKeys = getDesiredVisibleChunkKeys(horizon);
  const desiredLoadFiles = getDesiredLoadFiles(desiredChunkKeys);
  const retainedFiles = new Set<WorldTileFile>(desiredLoadFiles);

  state.chunkHorizon = {
    currentChunkKey: getChunkKey(horizon.currentChunkCoordinate),
    desiredChunkKeys,
    signature: horizon.signature,
  };

  let changed = false;

  for (const chunk of state.tileChunks.values()) {
    if (chunk.status !== "loaded") {
      continue;
    }
    if (retainedFiles.has(chunk.manifestEntry.fileName)) {
      continue;
    }

    unloadTileChunk(state, chunk);
    changed = true;
  }

  const loadCandidates = [...desiredLoadFiles]
    .map((fileName) => state.tileChunks.get(fileName))
    .filter(
      (chunk): chunk is WorldTileChunkRuntimeState =>
        chunk !== undefined && chunk.status === "unloaded",
    )
    .sort(
      (left, right) =>
        left.sceneWorldCenter.distanceToSquared(state.camera.position) -
        right.sceneWorldCenter.distanceToSquared(state.camera.position),
    );

  const chunksToLoad = loadCandidates.slice(0, MAX_CHUNK_LOADS_PER_TURN);
  for (const chunk of chunksToLoad) {
    await loadTileChunk(state, chunk);
    changed = true;
    if (state.isDisposed) {
      return false;
    }
  }

  if (changed) {
    updateWorldTileCounts(state);
    updateWorldTileDebugOverlay(state, "streaming");
    logWorldTileStreamingProgress(
      state,
      `chunk ${state.chunkHorizon.currentChunkKey} streamed`,
    );
  }

  return hasChunkStreamingWorkRemaining(state, desiredLoadFiles, retainedFiles);
}

async function loadTileChunk(
  state: VisioTechnologicaState,
  chunk: WorldTileChunkRuntimeState,
): Promise<void> {
  if (chunk.status !== "unloaded") {
    return;
  }

  chunk.status = "loading";
  const entry = await loadWorldTile(chunk.manifestEntry.fileName);

  if (state.isDisposed) {
    disposeWorldModel(entry.model);
    chunk.status = "unloaded";
    return;
  }

  positionWorldTile(entry.model, chunk.manifestEntry, state.tilePlacement);
  state.world.add(entry.model);
  state.world.updateMatrixWorld(true);
  chunk.model = entry.model;
  chunk.status = "loaded";
}

function unloadTileChunk(
  state: VisioTechnologicaState,
  chunk: WorldTileChunkRuntimeState,
): void {
  if (chunk.status !== "loaded" || chunk.model === null) {
    return;
  }

  chunk.status = "unloading";
  state.world.remove(chunk.model);
  disposeWorldModel(chunk.model);
  chunk.model = null;
  chunk.status = "unloaded";
}

function createCurrentChunkHorizon(
  camera: THREE.PerspectiveCamera,
  chunkDimensions: ChunkDimensions,
): ChunkViewHorizon {
  camera.updateMatrixWorld();
  const forwardWorldDirection = new THREE.Vector3();
  const rightWorldDirection = new THREE.Vector3();
  const upWorldDirection = new THREE.Vector3();

  camera.getWorldDirection(forwardWorldDirection);
  rightWorldDirection.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  upWorldDirection.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  return createChunkViewHorizon({
    dimensions: chunkDimensions,
    edgeBufferRadians: CHUNK_VIEW_EDGE_BUFFER_RADIANS,
    fadeStartRatio: CHUNK_VIEW_FADE_START_RATIO,
    forwardWorldDirection: toWorldDirection(forwardWorldDirection),
    observerWorldPosition: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    rightWorldDirection: toWorldDirection(rightWorldDirection),
    upWorldDirection: toWorldDirection(upWorldDirection),
    verticalFovRadians: THREE.MathUtils.degToRad(camera.fov),
    viewportAspect: camera.aspect,
    viewDistance: CHUNK_VIEW_DISTANCE,
  });
}

function getDesiredVisibleChunkKeys(
  horizon: ChunkViewHorizon,
): readonly ChunkKey[] {
  const desiredChunkKeys: ChunkKey[] = [];
  const seenChunkKeys = new Set<ChunkKey>();

  const sortedBounds = [...horizon.bounds].sort(
    (left, right) => left.distanceFromObserver - right.distanceFromObserver,
  );

  for (const bounds of sortedBounds) {
    if (seenChunkKeys.has(bounds.key)) {
      continue;
    }
    if (!VISIO_TILE_CHUNK_MANIFEST.entriesByChunkKey.has(bounds.key)) {
      continue;
    }

    desiredChunkKeys.push(bounds.key);
    seenChunkKeys.add(bounds.key);
    if (desiredChunkKeys.length >= MAX_VISIBLE_WORLD_TILE_CHUNKS) {
      break;
    }
  }

  return desiredChunkKeys;
}

function getDesiredLoadFiles(
  desiredChunkKeys: readonly ChunkKey[],
): ReadonlySet<WorldTileFile> {
  const desiredLoadFiles = new Set<WorldTileFile>();

  for (const chunkKey of desiredChunkKeys) {
    const manifestEntries =
      VISIO_TILE_CHUNK_MANIFEST.entriesByChunkKey.get(chunkKey) ?? [];
    for (const manifestEntry of manifestEntries) {
      desiredLoadFiles.add(manifestEntry.fileName);
    }
  }

  return desiredLoadFiles;
}

function updateChunkHorizonState(state: VisioTechnologicaState): boolean {
  const nextHorizon = createCurrentChunkHorizon(
    state.camera,
    state.tilePlacement.chunkDimensions,
  );
  const nextDesiredChunkKeys = getDesiredVisibleChunkKeys(nextHorizon);
  const nextSignature = `${nextHorizon.signature}/${nextDesiredChunkKeys.join(",")}`;

  if (nextSignature === state.chunkHorizon.signature) {
    return false;
  }

  state.chunkHorizon = {
    currentChunkKey: getChunkKey(nextHorizon.currentChunkCoordinate),
    desiredChunkKeys: nextDesiredChunkKeys,
    signature: nextSignature,
  };

  return true;
}

function hasChunkStreamingWorkRemaining(
  state: VisioTechnologicaState,
  desiredLoadFiles: ReadonlySet<WorldTileFile>,
  retainedFiles: ReadonlySet<WorldTileFile>,
): boolean {
  for (const chunk of state.tileChunks.values()) {
    if (
      desiredLoadFiles.has(chunk.manifestEntry.fileName) &&
      (chunk.status === "unloaded" || chunk.status === "loading")
    ) {
      return true;
    }

    if (
      !retainedFiles.has(chunk.manifestEntry.fileName) &&
      (chunk.status === "loaded" || chunk.status === "unloading")
    ) {
      return true;
    }
  }

  return false;
}

function updateWorldTileCounts(state: VisioTechnologicaState): void {
  let loadedWorldTileCount = 0;

  for (const chunk of state.tileChunks.values()) {
    if (chunk.status === "loaded") {
      loadedWorldTileCount += 1;
    }
  }

  state.loadedWorldTileCount = loadedWorldTileCount;
  state.remainingWorldTileCount =
    state.totalWorldTileCount - loadedWorldTileCount;
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

function getSceneWorldCenterForManifestEntry(
  manifestEntry: VisioTileChunkManifestEntry,
  tilePlacement: WorldTilePlacementContext,
): THREE.Vector3 {
  return new THREE.Vector3(
    manifestEntry.worldCenter.x * tilePlacement.chunkDimensions.width,
    tilePlacement.chunkDimensions.height / 2,
    manifestEntry.worldCenter.z * tilePlacement.chunkDimensions.depth,
  );
}

function positionWorldTile(
  model: THREE.Object3D,
  manifestEntry: VisioTileChunkManifestEntry,
  tilePlacement: WorldTilePlacementContext,
): void {
  const sceneWorldCenter = getSceneWorldCenterForManifestEntry(
    manifestEntry,
    tilePlacement,
  );

  model.position.set(
    sceneWorldCenter.x - tilePlacement.assetNativeOrigin.x,
    -sceneWorldCenter.z - tilePlacement.assetNativeOrigin.y,
    -tilePlacement.assetNativeOrigin.z,
  );
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

function positionCamera(
  camera: THREE.PerspectiveCamera,
  starterEntries: readonly VisioTileChunkManifestEntry[],
  tilePlacement: WorldTilePlacementContext,
): void {
  const starterCenter = getAverageStarterSceneCenter(
    starterEntries,
    tilePlacement,
  );

  camera.position.set(
    starterCenter.x,
    tilePlacement.chunkDimensions.height + WORLD_CAMERA_HEIGHT_OFFSET,
    starterCenter.z + WORLD_CAMERA_DISTANCE_OFFSET,
  );
  camera.lookAt(starterCenter.x, WORLD_LOOK_AT_HEIGHT, starterCenter.z);
}

function getAverageStarterSceneCenter(
  starterEntries: readonly VisioTileChunkManifestEntry[],
  tilePlacement: WorldTilePlacementContext,
): THREE.Vector3 {
  const total = new THREE.Vector3();

  for (const entry of starterEntries) {
    total.add(getSceneWorldCenterForManifestEntry(entry, tilePlacement));
  }

  return total.divideScalar(starterEntries.length);
}

function toWorldDirection(vector: THREE.Vector3): WorldDirection {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
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
  context.fillText(`${state.chunkHorizon.currentChunkKey} chunk`, 16, 82);

  context.textAlign = "right";
  context.fillStyle = "#000000";
  context.fillText(
    `${phase === "starter" ? "starter" : "streaming"} · ${state.chunkHorizon.desiredChunkKeys.length} visible`,
    304,
    82,
  );
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
