import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [];

export const manifest: ExperienceManifest = {
	id: "visio-technologica-city-test",
	name: "Visio Technologica City Test",
	description:
		"Empty city-test scene scaffold with orbit camera controls and two visibility origins for later model integration.",
	version: "0.1.0",
	author: "Julius Wenk",

	parameters,
	outputs: [],
	interfaces: { orientation: false, speed: false },

	camera: { fov: 65, near: 0.1, far: 300 },
	scene: {
		background: "#03070a",
		fogNear: 45,
		fogFar: 180,
		fogColor: "#03070a",
		ambientIntensity: 0.35,
		sunIntensity: 1.15,
		sunColor: "#d7f9ff",
		sunPosition: { x: 20, y: 30, z: 15 },
	},
	spawn: { position: { x: 0, y: 4, z: 14 } },

	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
