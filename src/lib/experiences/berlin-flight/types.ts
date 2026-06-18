import type { FlightPlayer } from "$lib/three/player";
import type { ExperienceState } from "../types";
import type { BerlinDebugOverlay } from "./debug/overlay";
import type { KeyboardFlightControls } from "./input/keyboard-flight-controls";
import type { TilesRuntimeAdapter } from "./runtime/tiles-runtime";
import type * as THREE from "three";

/**
 * Berlin Flight Experience State
 */
export interface BerlinState extends ExperienceState {
  /** Root containing all Berlin-owned scene objects */
  sceneRoot: THREE.Group;
  /** The 3D Tiles runtime adapter */
  tilesRuntime: TilesRuntimeAdapter | null;
  /** Group containing all tiles for easy management */
  tilesGroup: THREE.Group;
  /** Reference grid owned by this experience */
  gridHelper: THREE.GridHelper;
  /** The renderer instance for tiles resolution updates */
  renderer: THREE.WebGLRenderer;
  /** The camera used for rendering */
  camera: THREE.PerspectiveCamera;
  /** The flight player controller */
  player: FlightPlayer;
  /** Optional browser keyboard controls for desktop smoke testing */
  keyboardControls: KeyboardFlightControls | null;
  /** Current flight speed */
  speed: number;
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
