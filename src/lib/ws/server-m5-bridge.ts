import { M5_BRIDGE } from "../config/flight";
import type { ControllerMessage, OrientationData } from "../types/orientation";
import {
	type M5DeviceMessage,
	type M5OrientationMessage,
	parseM5DeviceMessage,
} from "./m5-protocol";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

const DEFAULT_M5_BRIDGE_PORT = 8787;
const DEFAULT_M5_BRIDGE_HOST = "0.0.0.0";
const DEFAULT_M5_DEVICE_PATH = "/ws/device";

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
	lowQualityLogged: boolean;
	neutralSent: boolean;
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
		console.info(`[m5-bridge] Listening on ws://${host}:${port}${path}`);
	});

	server.on("connection", (socket: WebSocket) => {
		const state = createClientState();
		clients.set(socket, state);
		activeStates.add(state);

		socket.on("message", (raw: RawData) => {
			try {
				const message = parseM5DeviceMessage(rawDataToString(raw));
				const state = rememberDevice(socket, message, clients);
				latestDeviceId = message.deviceId;
				handleM5DeviceMessage(message, state, broadcast);
			} catch (error) {
				console.warn("[m5-bridge] Invalid frame dropped", getErrorMessage(error));
			}
		});

		socket.on("close", () => {
			const state = clients.get(socket);
			if (state?.deviceId) {
				clearStaleTimer(state);
				console.info(`[m5-bridge] Device disconnected: ${state.deviceId}`);
				broadcastNeutralOrientation(state, broadcast, "disconnected");
			}
			if (state) {
				activeStates.delete(state);
			}
		});

		socket.on("error", (error: Error) => {
			console.warn("[m5-bridge] Device socket error", error.message);
		});
	});

	server.on("error", (error: Error) => {
		if (!closed) {
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
	if (message.quality < M5_BRIDGE.QUALITY_THRESHOLD) {
		logLowQualityDrop(message, state);
		return;
	}

	broadcast(mapM5OrientationToControllerMessage(message));
	scheduleStaleNeutral(message, state, broadcast);
}

function mapM5OrientationToControllerMessage(
	message: M5OrientationMessage,
): OrientationData {
	return {
		type: "orientation",
		pitch: applyDeadzoneAndClamp(
			message.pitch,
			M5_BRIDGE.PITCH_RANGE[0],
			M5_BRIDGE.PITCH_RANGE[1],
		),
		roll: applyDeadzoneAndClamp(
			message.roll,
			M5_BRIDGE.ROLL_RANGE[0],
			M5_BRIDGE.ROLL_RANGE[1],
		),
		timestamp: Date.now(),
	};
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
		lowQualityLogged: false,
		neutralSent: true,
		staleTimer: null,
	};
}

function applyDeadzoneAndClamp(
	value: number,
	minimum: number,
	maximum: number,
): number {
	if (Math.abs(value) < M5_BRIDGE.DEADZONE_DEGREES) return 0;
	return Math.max(minimum, Math.min(maximum, value));
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
	}, M5_BRIDGE.STALE_TIMEOUT_MS);
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
