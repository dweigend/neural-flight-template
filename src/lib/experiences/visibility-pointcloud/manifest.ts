import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [];

export const manifest: ExperienceManifest = {
	id: "visibility-pointcloud",
	name: "Visibility Pointcloud",
	description:
		"Prototype scene for a point-sampled mesh revealed only from a separate moving line-of-sight origin.",
	version: "0.1.0",
	author: "Julius Wenk",

	parameters,
	outputs: [],
	interfaces: { orientation: false, speed: false },

	camera: { fov: 65, near: 0.1, far: 180 },
	scene: {
		background: "#05070a",
		fogNear: 35,
		fogFar: 120,
		fogColor: "#05070a",
		ambientIntensity: 0.45,
		sunIntensity: 1.3,
		sunColor: "#ffffff",
		sunPosition: { x: 8, y: 12, z: 8 },
	},
	spawn: { position: { x: 0, y: 3.2, z: 9 } },

	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
