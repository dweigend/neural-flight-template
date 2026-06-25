import type { FlightPlayer } from "$lib/three/player";
import type { ExperienceState } from "../types";
import type { BerlinDebugOverlay } from "./debug/overlay";
import type { BerlinCollisionController } from "./collision/controller";
import type { BerlinConeGridRuntime } from "./runtime/cone-grid-runtime";
import type { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import type * as THREE from "three";

/**
 * Berlin Flight Experience State
 */
export interface BerlinState extends ExperienceState {
  /** Root containing all Berlin-owned scene objects */
  sceneRoot: THREE.Group;
  /** Berlin-only fill lights to improve neutral tile readability */
  fillLights: {
    hemisphere: THREE.HemisphereLight;
    directional: THREE.DirectionalLight;
  };
  /** The 3D Tiles runtime adapter */
  tilesRuntime: TilesRuntimeAdapter | null;
  /** Group containing all tiles for easy management */
  tilesGroup: THREE.Group;
  /** Streams nearby cone chunks around the player */
  coneRuntime: BerlinConeGridRuntime;
  /** Owns cone/tile collision debug processing */
  collisionController: BerlinCollisionController;
  /** The renderer instance for tiles resolution updates */
  renderer: THREE.WebGLRenderer;
  /** The camera used for rendering */
  camera: THREE.PerspectiveCamera;
  /** Loader camera centered on the player rig for tile selection */
  tileSelectionCamera: THREE.PerspectiveCamera;
  /** The flight player controller */
  player: FlightPlayer;
  /** Target flight speed */
  targetSpeed: number;
  /** Whether tiles are currently loading */
  isLoading: boolean;
  /** Whether the lightweight debug overlay is visible */
  debugEnabled: boolean;
  /** Optional debug overlay owned by this experience */
  debugOverlay: BerlinDebugOverlay | null;
  /** Whether the experience has started disposal */
  isDisposed: boolean;
  /** Cancels async tile setup when disposing mid-load */
  abortController: AbortController;
}
