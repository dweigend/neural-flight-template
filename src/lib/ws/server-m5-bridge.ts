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

export function startM5Bridge(
	broadcast: BroadcastControllerMessage,
	options: M5BridgeOptions = {},
): M5Bridge | null {
	const port = options.port ?? DEFAULT_M5_BRIDGE_PORT;
	const host = options.host ?? DEFAULT_M5_BRIDGE_HOST;
	const path = options.path ?? DEFAULT_M5_DEVICE_PATH;
	const clients = new WeakMap<WebSocket, string>();

	let latestDeviceId: string | null = null;
	let closed = false;

	const server = new WebSocketServer({ host, path, port });

	server.on("listening", () => {
		console.info(`[m5-bridge] Listening on ws://${host}:${port}${path}`);
	});

	server.on("connection", (socket: WebSocket) => {
		socket.on("message", (raw: RawData) => {
			try {
				const message = parseM5DeviceMessage(rawDataToString(raw));
				rememberDevice(socket, message, clients);
				latestDeviceId = message.deviceId;
				handleM5DeviceMessage(message, broadcast);
			} catch (error) {
				console.warn("[m5-bridge] Invalid frame dropped", getErrorMessage(error));
			}
		});

		socket.on("close", () => {
			const deviceId = clients.get(socket);
			if (deviceId) {
				console.info(`[m5-bridge] Device disconnected: ${deviceId}`);
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
			server.close();
			if (latestDeviceId) {
				console.info(`[m5-bridge] Closed; latest device was ${latestDeviceId}`);
			}
		},
	};
}

function handleM5DeviceMessage(
	message: M5DeviceMessage,
	broadcast: BroadcastControllerMessage,
): void {
	if (message.type === "register") {
		console.info(
			`[m5-bridge] Device registered: ${message.deviceId} (${message.firmwareVersion})`,
		);
		return;
	}

	if (message.type !== "orientation") return;

	broadcast(mapM5OrientationToControllerMessage(message));
}

function mapM5OrientationToControllerMessage(
	message: M5OrientationMessage,
): OrientationData {
	return {
		type: "orientation",
		pitch: message.pitch,
		roll: message.roll,
		timestamp: Date.now(),
	};
}

function rememberDevice(
	socket: WebSocket,
	message: M5DeviceMessage,
	clients: WeakMap<WebSocket, string>,
): void {
	const previousDeviceId = clients.get(socket);
	if (previousDeviceId === message.deviceId) return;

	clients.set(socket, message.deviceId);
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
