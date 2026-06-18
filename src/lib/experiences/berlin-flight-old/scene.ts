import * as THREE from "three";
import { FlightPlayer } from "$lib/three/player";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import {
  BERLIN_CAMERA,
  BERLIN_DEFAULT_SETTINGS,
  BERLIN_SPAWN,
  BERLIN_TILE_RUNTIME,
} from "./constants";
import {
  createStatusIndicator,
  disposeStatusIndicator,
  updateStatusIndicator,
} from "./debug/status-indicator";
import { zeroLocalCoordinate } from "./geo";
import { createTilesRuntimeAdapter } from "./runtime/tiles-runtime";
import { createBerlinTilesSource } from "./runtime/tiles-source";
import { createBerlinCameraRig } from "./runtime/camera-rig";
import {
  createDefaultBerlinSettings,
  createInitialTilesLoadState,
  type BerlinFlightState,
  type BerlinPlaceholderResources,
} from "./types";

function createPlaceholderMarker(): BerlinPlaceholderResources {
  const points = new Float32Array([
    -4, 0, 0, 4, 0, 0, 0, -4, 0, 0, 4, 0, 0, 0, -4, 0, 0, 4,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));

  const material = new THREE.LineBasicMaterial({ color: "#7dd3fc" });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "berlin-placeholder-marker";

  const group = new THREE.Group();
  group.name = "berlin-placeholder-root";
  group.visible = BERLIN_DEFAULT_SETTINGS.showPlaceholder;
  group.add(lines);

  return { group, geometry, material };
}

function disposePlaceholder(placeholder: BerlinPlaceholderResources): void {
  placeholder.group.removeFromParent();
  placeholder.geometry.dispose();
  placeholder.material.dispose();
}

function syncTilesLoadState(state: BerlinFlightState): void {
  state.tilesLoad.status = state.tilesRuntime.stats.status;
  state.tilesLoad.isReady = state.tilesRuntime.stats.status === "ready";
  state.tilesLoad.errorMessage = state.tilesRuntime.stats.lastErrorMessage;
}

async function initializeTilesRuntime(state: BerlinFlightState): Promise<void> {
  console.log("[BerlinFlight] Initializing tiles runtime...");
  const source = createBerlinTilesSource();
  if (!source) {
    console.error("[BerlinFlight] Missing Berlin tiles source config.");
    state.tilesLoad.status = "error";
    state.tilesLoad.errorMessage = "Missing Berlin tiles source config.";
    syncTilesLoadState(state);
    return;
  }

  console.log(
    "[BerlinFlight] Loading tiles source:",
    source.url || source.assetId,
  );
  try {
    await state.tilesRuntime.load(source);
    console.log("[BerlinFlight] Tiles runtime load call completed.");
    syncTilesLoadState(state); // Ensure state is synced after load
  } catch (err) {
    console.error("[BerlinFlight] Error during tilesRuntime.load:", err);
    syncTilesLoadState(state);
  }
}

export async function setup(ctx: SetupContext): Promise<BerlinFlightState> {
  const settings = createDefaultBerlinSettings();
  const cameraRig = createBerlinCameraRig(settings.baseSpeed);
  ctx.scene.add(cameraRig.root);

  const root = new THREE.Group();
  root.name = "berlin-flight-root";
  ctx.scene.add(root);

  const placeholder = createPlaceholderMarker();
  root.add(placeholder.group);

  const tilesRuntime = createTilesRuntimeAdapter();
  root.add(tilesRuntime.root);

  const onKeyDown = (e: KeyboardEvent) => cameraRig.handleKeyboard(e);
  const onKeyUp = (e: KeyboardEvent) => cameraRig.handleKeyboard(e);

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  const state: BerlinFlightState = {
    camera: cameraRig.camera,
    renderer: ctx.renderer,
    cameraRig,
    player: cameraRig.player,
    root,
    placeholder,
    tilesRuntime,
    tilesLoad: createInitialTilesLoadState(),
    settings,
    runtimeChoice: BERLIN_TILE_RUNTIME.id,
    cleanup: () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      }
    },
    isDisposed: false,
  };

  syncTilesLoadState(state);
  // Do not await here to avoid blocking the setup return
  initializeTilesRuntime(state).catch((err) => {
    console.error("Failed to initialize tiles runtime:", err);
  });
  return state;
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
  const s = state as BerlinFlightState;
  if (s.isDisposed) return { state: s };

  s.cameraRig.update(ctx.delta, s.tilesLoad);
  syncTilesLoadState(s);

  if (s.tilesLoad.isReady) {
    s.tilesRuntime.update({
      camera: s.camera,
      renderer: s.renderer,
      deltaSeconds: ctx.delta,
      originOffsetMeters: zeroLocalCoordinate(),
    });
  }

  if (!s.placeholder.group.visible) {
    return { state: s, outputs: { tilesReady: s.tilesLoad.isReady ? 1 : 0 } };
  }

  s.placeholder.group.rotation.y += ctx.delta * 0.35;
  return { state: s, outputs: { tilesReady: s.tilesLoad.isReady ? 1 : 0 } };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as BerlinFlightState;
  if (s.isDisposed) return;

  s.isDisposed = true;
  s.cleanup();
  s.tilesRuntime.dispose();
  s.cameraRig.dispose();
  disposePlaceholder(s.placeholder);
  s.root.removeFromParent();
  s.player.rig.removeFromParent();
  s.camera.clear();

  scene.remove(s.root);
  scene.remove(s.player.rig);
}
