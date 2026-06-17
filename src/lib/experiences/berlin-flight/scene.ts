import * as THREE from "three";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { createTilesRuntime } from "./runtime/tiles-runtime";
import { getBerlinTilesetUrl } from "./runtime/tiles-source";
import { BERLIN_MITTE_ORIGIN, geoToECEF } from "./geo";
import { FlightPlayer } from "$lib/three/player";
import { CAMERA, FLIGHT } from "$lib/config/flight";

/**
 * Initializes the Berlin scene
 */
export async function setup(ctx: SetupContext): Promise<BerlinState> {
  const tilesGroup = new THREE.Group();
  ctx.scene.add(tilesGroup);

  // Player (creates own camera + rig)
  const player = new FlightPlayer({
    fov: CAMERA.FOV,
    near: CAMERA.NEAR,
    far: 10000, // Increased for city scale
    spawnPosition: { x: 0, y: 100, z: 0 },
    baseSpeed: FLIGHT.BASE_SPEED,
    terrainSlowdown: 1.0, // No terrain slowdown for tiles yet
  });
  ctx.scene.add(player.rig);

  // Initial state
  const state: BerlinState = {
    tilesRuntime: null,
    tilesGroup,
    renderer: ctx.renderer,
    camera: player.camera,
    player,
    speed: 0,
    targetSpeed: 10,
    isLoading: true,
  };

  // Initialize 3D Tiles
  const url = getBerlinTilesetUrl();
  if (url) {
    const runtime = createTilesRuntime(url);
    state.tilesRuntime = runtime;

    try {
      const tiles = await runtime.loadTiles(tilesGroup);

      // Position the tileset relative to Berlin Mitte
      const originECEF = geoToECEF(BERLIN_MITTE_ORIGIN);
      tiles.group.position.set(-originECEF.x, -originECEF.y, -originECEF.z);

      // Rotate to align ECEF "Up" with Three.js "Up" (+Y)
      tiles.group.rotation.x = -Math.PI / 2;

      console.log("[BerlinFlight] Tileset loaded and positioned.");
    } catch (error) {
      console.error("[BerlinFlight] Failed to load tileset:", error);
    } finally {
      state.isLoading = false;
    }
  }

  // Reference grid
  const grid = new THREE.GridHelper(2000, 100);
  grid.position.y = -1;
  ctx.scene.add(grid);

  return state;
}

/**
 * Updates the scene every frame
 */
export function tick(state: BerlinState, ctx: TickContext) {
  const s = state as BerlinState;

  // Update player physics
  s.player.tick(ctx.delta);

  // Update tiles if they exist
  if (s.tilesRuntime) {
    s.tilesRuntime.update(ctx.camera, s.renderer);
  }

  return { state: s };
}

/**
 * Cleans up resources
 */
export function dispose(state: BerlinState, scene: THREE.Scene): void {
  const s = state as BerlinState;

  if (s.tilesRuntime) {
    s.tilesRuntime.dispose();
  }

  scene.remove(s.tilesGroup);
  scene.remove(s.player.rig);

  s.tilesGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          material.dispose();
        }
      } else {
        object.material.dispose();
      }
    }
  });
}
