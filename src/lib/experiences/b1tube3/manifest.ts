import type { ExperienceManifest, ParameterDef } from "../types";
import { dispose, setup, tick, applySettings, updatePlayer } from "./scene";

const parameters: ParameterDef[] = [
	{
		id: "autoSpeed",
		label: "Auto Forward Speed",
		group: "Movement",
		min: 0,
		max: 50,
		default: 10,
		step: 1,
		unit: "m/s",
		icon: "Gauge",
	},
];

export const manifest: ExperienceManifest = {
	id: "b1-lesser",
	name: "b1.lesser",
	description:
		"Geometric tube experience — abstract tunnel with pitch-controlled movement.",
	version: "0.1.0",
	author: "LUFULI",

	parameters,
	interfaces: { orientation: true, speed: false },

	camera: { fov: 70, near: 0.1, far: 1000 },
	scene: {
		background: "#000000",
		fogNear: 0,
		fogFar: 0,
		fogColor: "#000000",
		ambientIntensity: 0,
		sunIntensity: 0,
		sunColor: "#ffffff",
		sunPosition: { x: 0, y: 0, z: 0 },
	},
	spawn: { position: { x: 0, y: 0, z: 0 } },

	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
