import type { ExperienceManifest } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

export const manifest: ExperienceManifest = {
  id: "visio-technologica",
  name: "Visio Technologica",
  description: "Work in Progress Level Prototype for Visio Technologica",
  version: "0.1.0",
  author: "Lennard Lev & Julius Wenk",
  parameters: [],
  outputs: [],
  interfaces: { orientation: true, speed: false },
  camera: { fov: 68, near: 0.1, far: 5000 },
  scene: {
    background: "#d9dfe5",
    fogNear: 1000,
    fogFar: 2000,
    fogColor: "#d9dfe5",
    ambientIntensity: 0.8,
    sunIntensity: 0.9,
    sunColor: "#fff7ed",
    sunPosition: { x: 30, y: 60, z: 20 },
  },
  spawn: { position: { x: 0, y: 4, z: 8 } },
  setup,
  tick,
  applySettings,
  updatePlayer,
  dispose,
};
