import type { ExperienceState } from "../types";
import type { TilesRenderer } from "3d-tiles-renderer";
import type * as THREE from "three";

/**
 * Berlin Flight Experience State
 */
export interface BerlinState extends ExperienceState {
  /** The 3D Tiles renderer instance */
  tiles: TilesRenderer | null;
  /** Group containing all tiles for easy management */
  tilesGroup: THREE.Group;
  /** The renderer instance for tiles resolution updates */
  renderer: THREE.WebGLRenderer;
  /** Current flight speed */
  speed: number;
  /** Target flight speed */
  targetSpeed: number;
  /** Whether tiles are currently loading */
  isLoading: boolean;
}
