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
	{
		id: "steerSensitivity",
		label: "Controller Sensitivity",
		group: "Controls",
		min: 0,
		max: 0.5,
		default: 0.08,
		step: 0.01,
		icon: "Crosshair",
	},
];

export const manifest: ExperienceManifest = {
	id: "b3-lesser",
	name: "b3.lesser",
	description:
		"Infinite dune canyon — endless Moebius desert with scrolling terrain, glowing crystals and flying orbs.",
	version: "0.1.0",
	author: "LULULIFU",

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
