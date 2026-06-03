// ── Flight Physics ──
export const FLIGHT = {
	BASE_SPEED: 20,
	ACCEL_SPEED: 40,
	BRAKE_SPEED: 5,
	LERP_ALPHA: 0.15,
	ROLL_YAW_MULTIPLIER: 1.5,
	MIN_CLEARANCE: 8,
	TERRAIN_SLOWDOWN: 0.7,
	SPAWN_POSITION: { x: 0, y: 50, z: 0 },
} as const;

// ── Camera ──
export const CAMERA = {
	FOV: 75,
	NEAR: 0.1,
	FAR: 1000,
} as const;

// ── Controls ──
export const CONTROLS = {
	STEP_DEGREES: 30,
	PITCH_RANGE: [-90, 90] as [number, number],
	ROLL_RANGE: [-90, 90] as [number, number],
	BUTTONS: {
		UP: { pitch: -1, roll: 0 },
		DOWN: { pitch: 1, roll: 0 },
		LEFT: { pitch: 0, roll: -1 },
		RIGHT: { pitch: 0, roll: 1 },
	},
} as const;

export const M5_BRIDGE = {
	QUALITY_THRESHOLD: 0.5,
	DEADZONE_DEGREES: 1.5,
	SMOOTHING_ALPHA: 1,
	PITCH_SCALE: 1,
	ROLL_SCALE: 1,
	INVERT_PITCH: false,
	INVERT_ROLL: false,
	PITCH_RANGE: CONTROLS.PITCH_RANGE,
	ROLL_RANGE: CONTROLS.ROLL_RANGE,
	STALE_TIMEOUT_MS: 3000,
} as const;

export interface M5BridgeRuntimeConfig {
	qualityThreshold: number;
	deadzoneDegrees: number;
	smoothingAlpha: number;
	pitchScale: number;
	rollScale: number;
	invertPitch: boolean;
	invertRoll: boolean;
	maxPitch: number;
	maxRoll: number;
	staleTimeoutMs: number;
	calibrationEnabled: boolean;
	calibrationNeutralPitch: number;
	calibrationNeutralRoll: number;
	calibrationUpPitch: number;
	calibrationDownPitch: number;
	calibrationRightRoll: number;
	calibrationLeftRoll: number;
}

function createM5BridgeDefaults(): M5BridgeRuntimeConfig {
	return {
		qualityThreshold: M5_BRIDGE.QUALITY_THRESHOLD,
		deadzoneDegrees: M5_BRIDGE.DEADZONE_DEGREES,
		smoothingAlpha: M5_BRIDGE.SMOOTHING_ALPHA,
		pitchScale: M5_BRIDGE.PITCH_SCALE,
		rollScale: M5_BRIDGE.ROLL_SCALE,
		invertPitch: M5_BRIDGE.INVERT_PITCH,
		invertRoll: M5_BRIDGE.INVERT_ROLL,
		maxPitch: M5_BRIDGE.PITCH_RANGE[1],
		maxRoll: M5_BRIDGE.ROLL_RANGE[1],
		staleTimeoutMs: M5_BRIDGE.STALE_TIMEOUT_MS,
		calibrationEnabled: false,
		calibrationNeutralPitch: 0,
		calibrationNeutralRoll: 0,
		calibrationUpPitch: 0,
		calibrationDownPitch: 0,
		calibrationRightRoll: 0,
		calibrationLeftRoll: 0,
	};
}

export let m5BridgeRuntimeConfig: M5BridgeRuntimeConfig =
	createM5BridgeDefaults();

export function applyM5BridgeSettings(
	settings: Record<string, number | boolean>,
): void {
	for (const [key, value] of Object.entries(settings)) {
		switch (key) {
			case "qualityThreshold":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.qualityThreshold = clamp(value, 0, 1);
				}
				break;
			case "deadzoneDegrees":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.deadzoneDegrees = clamp(value, 0, 15);
				}
				break;
			case "smoothingAlpha":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.smoothingAlpha = clamp(value, 0.05, 1);
				}
				break;
			case "pitchScale":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.pitchScale = clamp(value, 0.1, 3);
				}
				break;
			case "rollScale":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.rollScale = clamp(value, 0.1, 3);
				}
				break;
			case "invertPitch":
				if (typeof value === "boolean") {
					m5BridgeRuntimeConfig.invertPitch = value;
				}
				break;
			case "invertRoll":
				if (typeof value === "boolean") {
					m5BridgeRuntimeConfig.invertRoll = value;
				}
				break;
			case "maxPitch":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.maxPitch = clamp(value, 5, 90);
				}
				break;
			case "maxRoll":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.maxRoll = clamp(value, 5, 90);
				}
				break;
			case "staleTimeoutMs":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.staleTimeoutMs = clamp(value, 500, 10_000);
				}
				break;
			case "calibrationEnabled":
				if (typeof value === "boolean") {
					m5BridgeRuntimeConfig.calibrationEnabled = value;
				}
				break;
			case "calibrationNeutralPitch":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationNeutralPitch = clamp(value, -180, 180);
				}
				break;
			case "calibrationNeutralRoll":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationNeutralRoll = clamp(value, -180, 180);
				}
				break;
			case "calibrationUpPitch":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationUpPitch = clamp(value, -180, 180);
				}
				break;
			case "calibrationDownPitch":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationDownPitch = clamp(value, -180, 180);
				}
				break;
			case "calibrationRightRoll":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationRightRoll = clamp(value, -180, 180);
				}
				break;
			case "calibrationLeftRoll":
				if (typeof value === "number") {
					m5BridgeRuntimeConfig.calibrationLeftRoll = clamp(value, -180, 180);
				}
				break;
		}
	}
}

export function resetM5BridgeSettings(): void {
	m5BridgeRuntimeConfig = createM5BridgeDefaults();
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

// ── Rings (per chunk) ──
export const RINGS = {
	PER_CHUNK: 2,
	RADIUS: 6,
	TUBE_RADIUS: 0.4,
	COLLECT_DISTANCE: 8,
	COLOR: 0xf1c40f,
	COLLECTED_COLOR: 0x2ecc71,
	HEIGHT_BASE: 20,
	HEIGHT_VARIATION: 30,
	EMISSIVE: 0.3,
	EMISSIVE_COLLECTED: 0.6,
	SEGMENTS: [12, 32] as [number, number],
} as const;

// ── Scene ──
export const SCENE = {
	SKY_COLOR: 0x87ceeb,
	FOG_NEAR: 100,
	FOG_FAR: 500,
	AMBIENT_INTENSITY: 0.3,
	SUN_INTENSITY: 3.0,
	SUN_COLOR: 0xfff4e0,
	SUN_POSITION: { x: 80, y: 150, z: 40 },
} as const;

// ── Terrain ──
export const TERRAIN = {
	CHUNK_SIZE: 128,
	VIEW_RADIUS: 2,
	MAX_POOL: 30,
	SEGMENTS: 32,
	NOISE: { octaves: 5, amplitude: 60, frequency: 0.005, persistence: 0.45 },
	WATER_Y: 5,
	WATER_SIZE: 4000,
	WATER_COLOR: 0x2980b9,
	WATER_OPACITY: 0.6,
} as const;

// ── Terrain Colors (brighter, more saturated) ──
export const TERRAIN_COLORS = {
	GRASS: 0x4caf50,
	YELLOW: 0xe8c840,
	ORANGE: 0xe07030,
	ROCK: 0x9e9e9e,
	SNOW: 0xfafafa,
	BANDS: [10, 25, 40, 50] as [number, number, number, number],
} as const;

// ── Decorations (per chunk) ──
export const DECORATIONS = {
	TREES_PER_CHUNK: 25,
	ROCKS_PER_CHUNK: 10,
	CROWN_COLORS: [
		0xc0392b,
		0xe74c3c, // reds
		0xe67e22,
		0xf39c12, // oranges
		0x8e44ad,
		0x9b59b6, // purples
		0xd63384,
		0xff6b9d, // pinks
		0x27ae60,
		0x2ecc71, // greens
	],
	TRUNK_COLOR: 0x5d4037,
	ROCK_COLOR: 0x7f8c8d,
} as const;

// ── Clouds ──
export const CLOUDS = {
	COUNT: 40,
	SPREAD: 500,
	HEIGHT_MIN: 150,
	HEIGHT_MAX: 280,
	BLOB_COUNT: [4, 8] as [number, number],
	BLOB_RADIUS: [10, 25] as [number, number],
	COLOR: 0xffffff,
	OPACITY: 0.9,
	DRIFT_SPEED: 8,
	DRIFT_DIRECTION: { x: 1, z: 0.3 },
} as const;

// ── Sky ──
export const SKY = {
	RADIUS: 800,
	DETAIL: 3,
	COLOR_TOP: 0x1a6fc4,
	COLOR_HORIZON: 0xffeebb,
	COLOR_BOTTOM: 0x87ceeb,
} as const;

// ── Runtime Config (mutable, changed via Settings Sidebar) ──

export interface RuntimeConfig {
	baseSpeed: number;
	rollYawMultiplier: number;
	lerpAlpha: number;
	fogNear: number;
	fogFar: number;
	cloudCount: number;
	cloudDriftEnabled: boolean;
	viewRadius: number;
	sunIntensity: number;
	skyColorTop: string;
	skyColorHorizon: string;
	skyColorBottom: string;
	ringColor: string;
	sunElevation: number;
	ringCountPerChunk: number;
	terrainAmplitude: number;
	terrainFrequency: number;
	fogColor: string;
	cloudHeight: number;
	waterLevel: number;
	treeDensity: number;
	minClearance: number;
	cloudOpacity: number;
	windSpeed: number;
}

function createDefaults(): RuntimeConfig {
	return {
		baseSpeed: FLIGHT.BASE_SPEED,
		rollYawMultiplier: FLIGHT.ROLL_YAW_MULTIPLIER,
		lerpAlpha: FLIGHT.LERP_ALPHA,
		fogNear: SCENE.FOG_NEAR,
		fogFar: SCENE.FOG_FAR,
		cloudCount: CLOUDS.COUNT,
		cloudDriftEnabled: true,
		viewRadius: TERRAIN.VIEW_RADIUS,
		sunIntensity: SCENE.SUN_INTENSITY,
		skyColorTop: "#1a6fc4",
		skyColorHorizon: "#ffeebb",
		skyColorBottom: "#87ceeb",
		ringColor: "#f1c40f",
		sunElevation: 65,
		ringCountPerChunk: RINGS.PER_CHUNK,
		terrainAmplitude: TERRAIN.NOISE.amplitude,
		terrainFrequency: TERRAIN.NOISE.frequency,
		fogColor: "#87ceeb",
		cloudHeight: 200,
		waterLevel: TERRAIN.WATER_Y,
		treeDensity: DECORATIONS.TREES_PER_CHUNK,
		minClearance: FLIGHT.MIN_CLEARANCE,
		cloudOpacity: CLOUDS.OPACITY,
		windSpeed: CLOUDS.DRIFT_SPEED,
	};
}

export let runtimeConfig: RuntimeConfig = createDefaults();

export function applySettings(
	settings: Record<string, number | boolean | string>,
): void {
	for (const [key, value] of Object.entries(settings)) {
		if (key in runtimeConfig) {
			(runtimeConfig as unknown as Record<string, number | boolean | string>)[
				key
			] = value;
		}
	}
}

export function resetRuntimeConfig(): void {
	runtimeConfig = createDefaults();
}
