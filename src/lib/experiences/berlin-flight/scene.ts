import * as THREE from "three";
import type { SetupContext, TickContext } from "../types";
import type { BerlinState } from "./types";

/**
 * Initializes the Berlin scene
 */
export async function setup(ctx: SetupContext): Promise<BerlinState> {
  const tilesGroup = new THREE.Group();
  ctx.scene.add(tilesGroup);

  // Initial state
  const state: BerlinState = {
    tiles: null, // Will be initialized in Phase 4
    tilesGroup,
    renderer: ctx.renderer,
    speed: 0,
    targetSpeed: 5,
    isLoading: false,
  };

  // Placeholder: Add a simple grid or floor for now
  const grid = new THREE.GridHelper(100, 10);
  tilesGroup.add(grid);

  return state;
}

/**
 * Updates the scene every frame
 */
export function tick(state: BerlinState, ctx: TickContext) {
  // Update tiles if they exist
  if (state.tiles) {
    state.tiles.setCamera(ctx.camera);
    state.tiles.setResolutionFromRenderer(ctx.camera, state.renderer);
    state.tiles.update();
  }

  return { state };
}

/**
 * Cleans up resources
 */
export function dispose(state: BerlinState, scene: THREE.Scene): void {
  if (state.tiles) {
    state.tiles.dispose();
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
