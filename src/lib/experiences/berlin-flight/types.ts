import type { FlightPlayer } from "$lib/three/player";
import type { ExperienceState } from "../types";
import type { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import type * as THREE from "three";

/**
 * Berlin Flight Experience State
 */
export interface BerlinState extends ExperienceState {
  /** The 3D Tiles runtime adapter */
  tilesRuntime: TilesRuntimeAdapter | null;
  /** Group containing all tiles for easy management */
  tilesGroup: THREE.Group;
  /** The renderer instance for tiles resolution updates */
  renderer: THREE.WebGLRenderer;
  /** The camera used for rendering */
  camera: THREE.PerspectiveCamera;
  /** The flight player controller */
  player: FlightPlayer;
  /** Current flight speed */
  speed: number;
  /** Target flight speed */
  targetSpeed: number;
  /** Whether tiles are currently loading */
  isLoading: boolean;
}
