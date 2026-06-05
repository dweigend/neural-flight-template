import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
	// ── Pacing ──────────────────────────────────────────────────────
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
		label: "Canal Duration",
		group: "Pacing",
		min: 10,
		max: 120,
		default: 45,
		step: 5,
		unit: "s",
		icon: "Timer",
	},

	// ── Flight ──────────────────────────────────────────────────────
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

	// ── Phase 3 (Bend) ──────────────────────────────────────────────
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

	// ── Debug ────────────────────────────────────────────────────────
	{
		id: "forcePhase",
		label: "Force Phase",
		group: "Debug",
		min: 0,
		max: 2,
		default: 0,
		step: 1,
		icon: "SkipForward",
	},
];

export const manifest: ExperienceManifest = {
	// ── Identity ────────────────────────────────────────────────────
	id: "b4-lesser",
	name: "B4.LESSER",
	description:
		"Canal → suction → dark room with doors.",
	version: "0.1.0",
	author: "B.lesser",

	// ── I/O ─────────────────────────────────────────────────────────
	parameters,
	outputs: [],
	interfaces: { orientation: true, speed: true },

	// ── Scene defaults ───────────────────────────────────────────────
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

	// ── Lifecycle ───────────────────────────────────────────────────
	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
