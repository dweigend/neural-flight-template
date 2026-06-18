import type {
  ExperienceManifest,
  ExperienceState,
  ParameterDef,
  PlayerOrientationInput,
  SetupContext,
  TickContext,
} from "../types";
import type * as THREE from "three";
import { BERLIN_FLIGHT_BASE_SPEED } from "./constants";
import { BERLIN_DEBUG_OVERLAY_DEFAULT } from "./debug/config";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";
import type { BerlinState } from "./types";

const parameters: ParameterDef[] = [
  {
    id: "moveSpeed",
    label: "Flight Speed",
    group: "Movement",
    min: 0,
    max: 50,
    default: BERLIN_FLIGHT_BASE_SPEED,
    step: 1,
    unit: "m/s",
    icon: "Gauge",
  },
  {
    id: "debugOverlay",
    label: "Debug Overlay",
    group: "Debug",
    type: "boolean",
    min: 0,
    max: 1,
    default: BERLIN_DEBUG_OVERLAY_DEFAULT,
    step: 1,
    icon: "Bug",
  },
];

export const manifest: ExperienceManifest = {
  id: "berlin-flight",
  name: "Berlin Flight",
  description:
    "Fly over a 3D photorealistic model of Berlin using Cesium Ion tiles.",
  version: "0.1.0",
  author: "Neural Flight",

  parameters,
  interfaces: { orientation: true, speed: true },

  camera: { fov: 75, near: 0.1, far: 10000 },
  scene: {
    background: "#87ceeb", // Sky blue
    fogNear: 100,
    fogFar: 5000,
    fogColor: "#87ceeb",
    ambientIntensity: 0.5,
    sunIntensity: 1.0,
    sunColor: "#ffffff",
    sunPosition: { x: 100, y: 200, z: 100 },
  },
  spawn: {
    position: { x: 0, y: 100, z: 0 },
  },

  setup: async (ctx: SetupContext): Promise<ExperienceState> => setup(ctx),
  tick: (state: ExperienceState, ctx: TickContext) =>
    tick(state as BerlinState, ctx),
  applySettings: (
    id: string,
    value: number | boolean | string,
    state: ExperienceState,
    scene: THREE.Scene,
  ): void => applySettings(id, value, state as BerlinState, scene),
  updatePlayer: (
    orientation: PlayerOrientationInput,
    speed: { accelerate: boolean; brake: boolean },
    state: ExperienceState,
    delta: number,
  ): void => updatePlayer(orientation, speed, state as BerlinState, delta),
  dispose: (state: ExperienceState, scene: THREE.Scene): void =>
    dispose(state as BerlinState, scene),
};
