import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
	{
		id: "tunnelSpeed",
		label: "Tunnel Speed",
		group: "Pacing",
		min: 0.05,
		max: 1.2,
		default: 0.28,
		step: 0.05,
		unit: "u/s",
		icon: "Gauge",
	},
	{
		id: "phaseDuration",
		label: "Phase Duration",
		group: "Pacing",
		min: 15,
		max: 90,
		default: 35,
		step: 5,
		unit: "s",
		icon: "Timer",
	},
	{
		id: "baseSpeed",
		label: "Flight Speed",
		group: "Flight",
		min: 1,
		max: 20,
		default: 5,
		step: 0.5,
		unit: "m/s",
		icon: "Wind",
	},
	{
		id: "bendSpeed",
		label: "Warp Rate",
		group: "Phase 3 · Bend",
		min: 0.0005,
		max: 0.015,
		default: 0.005,
		step: 0.0005,
		icon: "Orbit",
	},
	{
		id: "forcePhase",
		label: "Force Phase",
		group: "Debug",
		min: 0,
		max: 5,
		default: 0,
		step: 1,
		icon: "SkipForward",
	},
];

export const manifest: ExperienceManifest = {
	id: "b5-lesser",
	name: "B5.LESSER",
	description:
		"Return through the tube. Six phases: Entry → Tube → Space → Bend → Climax → Exit.",
	version: "0.1.0",
	author: "B.lesser",

	parameters,
	outputs: [],
	interfaces: { orientation: true, speed: true },

	camera: { fov: 86, near: 0.05, far: 600 },
	scene: {
		background: "#000000",
		fogNear: 0,
		fogFar: 0,
		fogColor: "#000000",
		ambientIntensity: 0.0,
		sunIntensity: 0.0,
		sunColor: "#ffffff",
		sunPosition: { x: 0, y: 100, z: 0 },
	},
	spawn: { position: { x: 0, y: 0, z: 0 } },

	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
