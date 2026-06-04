import { m5BridgeRuntimeConfig } from "../config/flight";
import type { ControllerMessage, OrientationData } from "../types/orientation";
import {
	type M5DeviceMessage,
	type M5OrientationMessage,
	parseM5DeviceMessage,
} from "./m5-protocol";
import {
	recordM5BridgeClosed,
	recordM5BridgeError,
	recordM5BridgeListening,
	recordM5DeviceDisconnected,
	recordM5DeviceMessage,
} from "./m5-status";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

const DEFAULT_M5_BRIDGE_PORT = 8787;
const DEFAULT_M5_BRIDGE_HOST = "0.0.0.0";
const DEFAULT_M5_DEVICE_PATH = "/ws/device";
const MIN_CALIBRATION_AXIS_SPAN = 1;

export interface M5BridgeOptions {
	port?: number;
	host?: string;
	path?: string;
}

export interface M5Bridge {
	close: () => void;
}

type BroadcastControllerMessage = (message: ControllerMessage) => void;

interface M5ClientState {
	deviceId?: string;
	hasSmoothedOrientation: boolean;
	lowQualityLogged: boolean;
	neutralSent: boolean;
	smoothedPitch: number;
	smoothedRoll: number;
	staleTimer: ReturnType<typeof setTimeout> | null;
}

export function startM5Bridge(
	broadcast: BroadcastControllerMessage,
	options: M5BridgeOptions = {},
): M5Bridge | null {
	const port = options.port ?? DEFAULT_M5_BRIDGE_PORT;
	const host = options.host ?? DEFAULT_M5_BRIDGE_HOST;
	const path = options.path ?? DEFAULT_M5_DEVICE_PATH;
	const clients = new WeakMap<WebSocket, M5ClientState>();
	const activeStates = new Set<M5ClientState>();

	let latestDeviceId: string | null = null;
	let closed = false;

	const server = new WebSocketServer({ host, path, port });

	server.on("listening", () => {
		const endpoint = `ws://${host}:${port}${path}`;
		recordM5BridgeListening(endpoint);
		console.info(`[m5-bridge] Listening on ${endpoint}`);
	});

	server.on("connection", (socket: WebSocket) => {
		const state = createClientState();
		clients.set(socket, state);
		activeStates.add(state);

		socket.on("message", (raw: RawData) => {
			try {
				const message = parseM5DeviceMessage(rawDataToString(raw));
				recordM5DeviceMessage(message);
				const state = rememberDevice(socket, message, clients);
				latestDeviceId = message.deviceId;
				handleM5DeviceMessage(message, state, broadcast);
			} catch (error) {
				const message = getErrorMessage(error);
				recordM5BridgeError(message);
				console.warn("[m5-bridge] Invalid frame dropped", message);
			}
		});

		socket.on("close", () => {
			const state = clients.get(socket);
			if (state?.deviceId) {
				clearStaleTimer(state);
				recordM5DeviceDisconnected(state.deviceId);
				console.info(`[m5-bridge] Device disconnected: ${state.deviceId}`);
				broadcastNeutralOrientation(state, broadcast, "disconnected");
			}
			if (state) {
				activeStates.delete(state);
			}
		});

		socket.on("error", (error: Error) => {
			recordM5BridgeError(error.message);
			console.warn("[m5-bridge] Device socket error", error.message);
		});
	});

	server.on("error", (error: Error) => {
		if (!closed) {
			recordM5BridgeError(error.message);
			console.warn("[m5-bridge] Server error", error.message);
		}
	});

	return {
		close: () => {
			closed = true;
			for (const state of activeStates) {
				clearStaleTimer(state);
			}
			activeStates.clear();
			server.close();
			recordM5BridgeClosed();
			if (latestDeviceId) {
				console.info(`[m5-bridge] Closed; latest device was ${latestDeviceId}`);
			}
		},
	};
}

function handleM5DeviceMessage(
	message: M5DeviceMessage,
	state: M5ClientState,
	broadcast: BroadcastControllerMessage,
): void {
	if (message.type === "register") {
		console.info(
			`[m5-bridge] Device registered: ${message.deviceId} (${message.firmwareVersion})`,
		);
		return;
	}

	if (message.type !== "orientation") return;
	if (message.quality < m5BridgeRuntimeConfig.qualityThreshold) {
		logLowQualityDrop(message, state);
		return;
	}

	broadcast(mapM5OrientationToControllerMessage(message, state));
	scheduleStaleNeutral(message, state, broadcast);
}

function mapM5OrientationToControllerMessage(
	message: M5OrientationMessage,
	state: M5ClientState,
): OrientationData {
	const mappedPitch =
		(mapM5Pitch(message.pitch, message.roll) *
			m5BridgeRuntimeConfig.pitchScale) *
		(m5BridgeRuntimeConfig.invertPitch ? -1 : 1);
	const mappedRoll =
		(mapM5Roll(message.pitch, message.roll) * m5BridgeRuntimeConfig.rollScale) *
		(m5BridgeRuntimeConfig.invertRoll ? -1 : 1);
	const targetPitch = applyDeadzoneAndClamp(
		mappedPitch,
		-m5BridgeRuntimeConfig.maxPitch,
		m5BridgeRuntimeConfig.maxPitch,
		m5BridgeRuntimeConfig.pitchDeadzoneDegrees,
	);
	const targetRoll = applyDeadzoneAndClamp(
		mappedRoll,
		-m5BridgeRuntimeConfig.maxRoll,
		m5BridgeRuntimeConfig.maxRoll,
		m5BridgeRuntimeConfig.rollDeadzoneDegrees,
	);
	const pitch = smoothValue(
		state.smoothedPitch,
		targetPitch,
		m5BridgeRuntimeConfig.smoothingAlpha,
		state.hasSmoothedOrientation,
	);
	const roll = smoothValue(
		state.smoothedRoll,
		targetRoll,
		m5BridgeRuntimeConfig.smoothingAlpha,
		state.hasSmoothedOrientation,
	);

	state.hasSmoothedOrientation = true;
	state.smoothedPitch = pitch;
	state.smoothedRoll = roll;

	return {
		type: "orientation",
		pitch,
		roll,
		timestamp: Date.now(),
	};
}

function mapM5Pitch(rawPitch: number, rawRoll: number): number {
	if (!m5BridgeRuntimeConfig.calibrationEnabled) {
		return m5BridgeRuntimeConfig.mountingPitchUsesRoll ? rawRoll : rawPitch;
	}
	const rawValue = m5BridgeRuntimeConfig.calibrationPitchUsesRoll
		? rawRoll
		: rawPitch;

	return mapCalibratedAxis({
		rawValue,
		neutralValue: m5BridgeRuntimeConfig.calibrationNeutralPitch,
		positiveRawValue: m5BridgeRuntimeConfig.calibrationDownPitch,
		negativeRawValue: m5BridgeRuntimeConfig.calibrationUpPitch,
		positiveOutputValue: m5BridgeRuntimeConfig.maxPitch,
		negativeOutputValue: -m5BridgeRuntimeConfig.maxPitch,
	});
}

function mapM5Roll(rawPitch: number, rawRoll: number): number {
	if (!m5BridgeRuntimeConfig.calibrationEnabled) {
		return m5BridgeRuntimeConfig.mountingRollUsesPitch ? rawPitch : rawRoll;
	}
	const rawValue = m5BridgeRuntimeConfig.calibrationRollUsesPitch
		? rawPitch
		: rawRoll;

	return mapCalibratedAxis({
		rawValue,
		neutralValue: m5BridgeRuntimeConfig.calibrationNeutralRoll,
		positiveRawValue: m5BridgeRuntimeConfig.calibrationRightRoll,
		negativeRawValue: m5BridgeRuntimeConfig.calibrationLeftRoll,
		positiveOutputValue: m5BridgeRuntimeConfig.maxRoll,
		negativeOutputValue: -m5BridgeRuntimeConfig.maxRoll,
	});
}

interface CalibratedAxisInput {
	rawValue: number;
	neutralValue: number;
	positiveRawValue: number;
	negativeRawValue: number;
	positiveOutputValue: number;
	negativeOutputValue: number;
}

function mapCalibratedAxis(input: CalibratedAxisInput): number {
	const positiveDelta = input.positiveRawValue - input.neutralValue;
	const negativeDelta = input.negativeRawValue - input.neutralValue;
	const rawDelta = input.rawValue - input.neutralValue;

	if (
		Math.abs(positiveDelta) < MIN_CALIBRATION_AXIS_SPAN ||
		Math.abs(negativeDelta) < MIN_CALIBRATION_AXIS_SPAN
	) {
		return rawDelta;
	}

	if (rawDelta * positiveDelta >= 0) {
		return (rawDelta / positiveDelta) * input.positiveOutputValue;
	}

	return (rawDelta / negativeDelta) * input.negativeOutputValue;
}

function rememberDevice(
	socket: WebSocket,
	message: M5DeviceMessage,
	clients: WeakMap<WebSocket, M5ClientState>,
): M5ClientState {
	const state = clients.get(socket) ?? createClientState();
	const previousDeviceId = state.deviceId;
	if (previousDeviceId === message.deviceId) return state;

	state.deviceId = message.deviceId;
	state.lowQualityLogged = false;
	clients.set(socket, state);
	return state;
}

function createClientState(): M5ClientState {
	return {
		hasSmoothedOrientation: false,
		lowQualityLogged: false,
		neutralSent: true,
		smoothedPitch: 0,
		smoothedRoll: 0,
		staleTimer: null,
	};
}

function applyDeadzoneAndClamp(
	value: number,
	minimum: number,
	maximum: number,
	deadzoneDegrees: number,
): number {
	if (Math.abs(value) < deadzoneDegrees) return 0;
	return Math.max(minimum, Math.min(maximum, value));
}

function smoothValue(
	previous: number,
	next: number,
	alpha: number,
	hasPrevious: boolean,
): number {
	if (!hasPrevious) return next;
	return previous + (next - previous) * alpha;
}

function scheduleStaleNeutral(
	message: M5OrientationMessage,
	state: M5ClientState,
	broadcast: BroadcastControllerMessage,
): void {
	clearStaleTimer(state);
	state.neutralSent = false;
	state.staleTimer = setTimeout(() => {
		console.info(`[m5-bridge] Device stale: ${message.deviceId}; neutralizing`);
		broadcastNeutralOrientation(state, broadcast, "stale");
	}, m5BridgeRuntimeConfig.staleTimeoutMs);
}

function clearStaleTimer(state: M5ClientState): void {
	if (!state.staleTimer) return;
	clearTimeout(state.staleTimer);
	state.staleTimer = null;
}

function broadcastNeutralOrientation(
	state: M5ClientState,
	broadcast: BroadcastControllerMessage,
	reason: "disconnected" | "stale",
): void {
	if (state.neutralSent) return;
	state.neutralSent = true;
	state.hasSmoothedOrientation = false;
	state.smoothedPitch = 0;
	state.smoothedRoll = 0;
	state.staleTimer = null;
	broadcast({
		type: "orientation",
		pitch: 0,
		roll: 0,
		timestamp: Date.now(),
	});
	console.info(`[m5-bridge] Neutral orientation sent (${reason})`);
}

function logLowQualityDrop(
	message: M5OrientationMessage,
	state: M5ClientState,
): void {
	if (state.lowQualityLogged) return;
	state.lowQualityLogged = true;
	console.warn(
		`[m5-bridge] Dropping low-quality orientation from ${message.deviceId} (${message.quality})`,
	);
}

function rawDataToString(raw: RawData): string {
	if (Array.isArray(raw)) {
		return Buffer.concat(raw).toString("utf8");
	}

	if (raw instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(raw)).toString("utf8");
	}

	return Buffer.from(raw).toString("utf8");
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
