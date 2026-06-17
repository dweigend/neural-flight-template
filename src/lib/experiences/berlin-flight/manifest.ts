import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
	{
		id: "moveSpeed",
		label: "Flight Speed",
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
	id: "berlin-flight",
	name: "Berlin Flight",
	description: "Fly over a 3D photorealistic model of Berlin using Cesium Ion tiles.",
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

	setup: setup as any,
	tick: tick as any,
	applySettings: applySettings as any,
	updatePlayer: updatePlayer as any,
	dispose: dispose as any,
};
