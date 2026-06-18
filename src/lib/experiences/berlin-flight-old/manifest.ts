import type { ExperienceManifest, ParameterDef } from "../types";
import {
  BERLIN_CAMERA,
  BERLIN_EXPERIENCE_ID,
  BERLIN_SCENE,
  BERLIN_SPAWN,
  BERLIN_TILE_RUNTIME,
} from "./constants";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
  {
    id: "baseSpeed",
    label: "Base Speed",
    group: "Flight",
    min: 4,
    max: 40,
    default: 12,
    step: 1,
    unit: "m/s",
    icon: "Gauge",
  },
  {
    id: "showPlaceholder",
    label: "Show Placeholder",
    group: "Debug",
    type: "boolean",
    min: 0,
    max: 1,
    default: false,
    step: 1,
    icon: "Move3d",
  },
];

export const manifest: ExperienceManifest = {
  id: BERLIN_EXPERIENCE_ID,
  name: "Berlin Flight",
  description: `Minimal Berlin Mitte scaffold targeting ${BERLIN_TILE_RUNTIME.packageName} for phase 1.`,
  version: "0.1.0",
  author: "ICAROS Lab",
  parameters,
  outputs: [
    {
      id: "tilesReady",
      label: "Tiles Ready",
      type: "number",
    },
  ],
  interfaces: { orientation: true, speed: true },
  camera: BERLIN_CAMERA,
  scene: BERLIN_SCENE,
  spawn: BERLIN_SPAWN,
  setup,
  tick,
  applySettings,
  updatePlayer,
  dispose,
};
