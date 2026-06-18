import type * as THREE from "three";
import type { FlightPlayer } from "$lib/three/player";
import type { ExperienceState } from "../types";
import { BERLIN_DEFAULT_SETTINGS, BERLIN_TILE_RUNTIME } from "./constants";
import type { BerlinStatusIndicator } from "./debug/status-indicator";
import type { CameraRig } from "./runtime/camera-rig";
import type {
  TilesRuntimeAdapter,
  TilesRuntimeStatus,
} from "./runtime/tiles-runtime";

export type BerlinTileRuntimeChoice = typeof BERLIN_TILE_RUNTIME.id;

export interface BerlinExperienceSettings {
  baseSpeed: number;
  showPlaceholder: boolean;
}

export interface BerlinPlaceholderResources {
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
}

export interface BerlinTilesLoadState {
  status: TilesRuntimeStatus;
  isReady: boolean;
  errorMessage: string | null;
}

export interface BerlinFlightState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  cameraRig: CameraRig;
  player: FlightPlayer;
  root: THREE.Group;
  placeholder: BerlinPlaceholderResources;
  tilesRuntime: TilesRuntimeAdapter;
  tilesLoad: BerlinTilesLoadState;
  settings: BerlinExperienceSettings;
  runtimeChoice: BerlinTileRuntimeChoice;
  cleanup: () => void;
  isDisposed: boolean;
}

export function createDefaultBerlinSettings(): BerlinExperienceSettings {
  return {
    baseSpeed: BERLIN_DEFAULT_SETTINGS.baseSpeed,
    showPlaceholder: BERLIN_DEFAULT_SETTINGS.showPlaceholder,
  };
}

export function createInitialTilesLoadState(): BerlinTilesLoadState {
  return {
    status: "idle",
    isReady: false,
    errorMessage: null,
  };
}
