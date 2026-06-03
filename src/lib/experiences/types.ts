import type * as THREE from "three";

// ── Signal Types ──

/** A normalized float [0, 1] — same as Node Editor signals */
export type SignalValue = number;

/** RGB color as normalized channels */
export interface ColorValue {
	r: number; // 0-1
	g: number; // 0-1
	b: number; // 0-1
}

// ── Parameter Definition ──

/** Describes a steerable parameter that appears in the Node Editor + Settings Sidebar */
export interface ParameterDef {
	/** Unique key — becomes the Node Editor output node ID */
	id: string;
	/** Display label in UI */
	label: string;
	/** Parameter grouping in Settings Sidebar */
	group: string;
	/** Input type — determines which widget the Sidebar renders (default: "number") */
	type?: "number" | "boolean" | "color";
	/** Real-world range — Node Editor sends 0-1, remap happens in applySettings() */
	min: number;
	max: number;
	/** Default value (number for sliders, boolean/string stored as number 0/1 for booleans) */
	default: number | boolean | string;
	/** Increment step for Settings Sidebar slider */
	step: number;
	/** Optional unit label (e.g. "m", "Hz", "%") */
	unit?: string;
	/** Lucide icon name for the generated Node Editor output node */
	icon?: string;
}

// ── Output Definition ──

/** Describes a value the experience sends TO the Node Editor (read-only signal) */
export interface OutputDef {
	/** Unique key */
	id: string;
	/** Display label */
	label: string;
	/** Value type */
	type: "number" | "color";
}

// ── Interface Requirements ──

/** Declares which input interfaces the experience supports */
export interface InterfaceDef {
	/** Requires pitch/roll orientation data (ICAROS, Gyro, Controller) */
	orientation: boolean;
	/** Requires speed commands (Accelerate/Brake) */
	speed: boolean;
	/** Requires trigger inputs (e.g. hand grab in VR) */
	triggers?: string[];
}

// ── Camera + Scene Config ──

export interface CameraConfig {
	fov: number;
	near: number;
	far: number;
}

export interface SceneConfig {
	/** Background color (CSS hex) */
	background: string;
	/** Fog near distance — 0 = no fog */
	fogNear: number;
	/** Fog far distance */
	fogFar: number;
	/** Fog color (CSS hex) */
	fogColor: string;
	/** Ambient light intensity */
	ambientIntensity: number;
	/** Directional light intensity */
	sunIntensity: number;
	/** Directional light color (CSS hex) */
	sunColor: string;
	/** Directional light position */
	sunPosition: { x: number; y: number; z: number };
}

export interface SpawnConfig {
	position: { x: number; y: number; z: number };
	/** Optional initial rotation (euler degrees) */
	rotation?: { x: number; y: number; z: number };
}

// ── Experience State ──

/**
 * Mutable state bag — managed by the experience, opaque to infrastructure.
 *
 * Each experience defines its own shape. The Loader passes this through
 * without reading it — only your experience code touches these values.
 *
 * Example (Mountain Flight):
 *   { terrain: TerrainManager, rings: Ring[], clouds: Group, player: FlightPlayer }
 *
 * Example (Template):
 *   { cubes: Mesh[], rotationSpeed: number }
 */
export interface ExperienceState {
	[key: string]: unknown;
}

// ── Runtime Values ──

/**
 * Current parameter values at **real-world scale** — maintained by Loader.
 *
 * The Node Editor sends normalized 0-1 signals. The Loader remaps them using
 * the parameter's min/max range before storing them here. Your applySettings()
 * receives the real value directly — no remapping needed.
 *
 * Example: { "flight-speed": 42, "fog-density": 0.8, "show-rings": true }
 */
export interface RuntimeValues {
	[parameterId: string]: number | boolean | string;
}

// ── Lifecycle Contexts ──

export interface SetupContext {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	renderer: THREE.WebGLRenderer;
}

export interface TickContext {
	delta: number;
	elapsed: number;
	camera: THREE.PerspectiveCamera;
	playerPosition: THREE.Vector3;
	playerRotation: THREE.Euler;
}

// ── The Manifest ──

export interface ExperienceManifest {
	// ── Identity ──
	/** Unique identifier (kebab-case, e.g. "mountain-flight") */
	id: string;
	/** Display name */
	name: string;
	/** Short description for catalog */
	description: string;
	/** Version string (semver) */
	version: string;
	/** Author name(s) */
	author: string;
	/** Optional thumbnail path (relative to experience folder) */
	thumbnail?: string;

	// ── I/O Contract ──
	/** Steerable parameters — appear in Node Editor + Settings Sidebar */
	parameters: ParameterDef[];
	/** Read-only outputs — sent from experience to Node Editor */
	outputs?: OutputDef[];
	/** Required input interfaces */
	interfaces: InterfaceDef;

	// ── Scene Defaults ──
	camera: CameraConfig;
	scene: SceneConfig;
	spawn: SpawnConfig;

	// ── Lifecycle Methods ──

	/** Called once when experience loads. Add objects to scene, create meshes, load assets. */
	setup: (ctx: SetupContext) => Promise<ExperienceState>;

	/** Called every frame. Update animations, physics, check collisions. */
	tick: (
		state: ExperienceState,
		ctx: TickContext,
	) => {
		state: ExperienceState;
		outputs?: Record<string, SignalValue | ColorValue>;
		/** If provided, called instead of renderer.render() for custom post-processing */
		render?: (delta: number) => void;
	};

	/** Called when a parameter changes. Map parameter ID to scene changes. */
	applySettings: (
		id: string,
		value: number | boolean | string,
		state: ExperienceState,
		scene: THREE.Scene,
	) => void;

	/** Called when orientation data arrives. Update player physics. */
	updatePlayer: (
		orientation: { pitch: number; roll: number },
		speed: { accelerate: boolean; brake: boolean },
		state: ExperienceState,
		delta: number,
	) => void;

	/** Called when experience unloads. Dispose geometries, materials, textures. */
	dispose: (state: ExperienceState, scene: THREE.Scene) => void;
}
