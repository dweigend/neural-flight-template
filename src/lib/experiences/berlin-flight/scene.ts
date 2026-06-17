import * as THREE from "three";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";
import { createTilesRuntime } from "./runtime/tiles-runtime";
import { getBerlinTilesetUrl } from "./runtime/tiles-source";
import { BERLIN_MITTE_ORIGIN, geoToECEF } from "./geo";

/**
 * Initializes the Berlin scene
 */
export async function setup(ctx: SetupContext): Promise<BerlinState> {
  const tilesGroup = new THREE.Group();
  ctx.scene.add(tilesGroup);

  // Initial state
  const state: BerlinState = {
    tilesRuntime: null,
    tilesGroup,
    renderer: ctx.renderer,
    speed: 0,
    targetSpeed: 5,
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
      // 1. Convert origin to ECEF
      const originECEF = geoToECEF(BERLIN_MITTE_ORIGIN);

      // 2. Offset the tileset group
      // Note: 3d-tiles-renderer's internal group is in ECEF.
      // We subtract our origin to bring Berlin Mitte to (0,0,0).
      tiles.group.position.set(-originECEF.x, -originECEF.y, -originECEF.z);

      // 3. Rotate to align ECEF "Up" with Three.js "Up" (+Y)
      // This is a simplification; for Phase 4 smoke test, we'll see if this is enough.
      // Usually requires a more complex matrix rotation.
      tiles.group.rotation.x = -Math.PI / 2;

      console.log(
        "[BerlinFlight] Tileset loaded and positioned at:",
        originECEF,
      );
    } catch (error) {
      console.error("[BerlinFlight] Failed to load tileset:", error);
    } finally {
      state.isLoading = false;
    }
  }

  // Placeholder: Add a simple grid for reference
  const grid = new THREE.GridHelper(1000, 100);
  grid.position.y = -1; // Slightly below "ground"
  ctx.scene.add(grid);

  return state;
}

/**
 * Updates the scene every frame
 */
export function tick(state: BerlinState, ctx: TickContext) {
  // Update tiles if they exist
  if (state.tilesRuntime) {
    state.tilesRuntime.update(ctx.camera, state.renderer);
  }

  return { state };
}

/**
 * Cleans up resources
 */
export function dispose(state: BerlinState, scene: THREE.Scene): void {
  if (state.tilesRuntime) {
    state.tilesRuntime.dispose();
  }

  scene.remove(state.tilesGroup);

  state.tilesGroup.traverse((object) => {
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
