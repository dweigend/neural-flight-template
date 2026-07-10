import type {
	M5DeviceMessage,
	M5HeartbeatMessage,
	M5OrientationMessage,
	M5RegisterMessage,
} from "./m5-protocol";

export interface M5BridgeStatus {
	bridgeListening: boolean;
	endpoint: string | null;
	connected: boolean;
	deviceId: string | null;
	firmwareVersion: string | null;
	capabilities: string[];
	lastMessageAt: number | null;
	lastHeartbeatAt: number | null;
	lastOrientationAt: number | null;
	rssi: number | null;
	freeHeap: number | null;
	batteryVoltage: number | null;
	uptimeMs: number | null;
	calibrated: boolean | null;
	streaming: boolean | null;
	orientation: {
		pitch: number;
		roll: number;
		yaw: number;
		quality: number;
	} | null;
	lastEvent: string | null;
	lastError: string | null;
	updatedAt: number;
}

interface M5StatusGlobal {
	__neuralFlightM5BridgeStatus?: M5BridgeStatus;
}

export function getM5BridgeStatus(): M5BridgeStatus {
	const status = readStatus();
	return {
		...status,
		capabilities: [...status.capabilities],
		orientation: status.orientation ? { ...status.orientation } : null,
	};
}

export function recordM5BridgeListening(endpoint: string): void {
	const status = readStatus();
	writeStatus({
		...status,
		bridgeListening: true,
		endpoint,
		lastEvent: "Bridge listening",
		updatedAt: Date.now(),
	});
}

export function recordM5BridgeClosed(): void {
	const status = readStatus();
	writeStatus({
		...status,
		bridgeListening: false,
		connected: false,
		lastEvent: "Bridge closed",
		updatedAt: Date.now(),
	});
}

export function recordM5DeviceMessage(message: M5DeviceMessage): void {
	const now = Date.now();
	const status = readStatus();
	writeStatus({
		...status,
		connected: true,
		deviceId: message.deviceId,
		lastMessageAt: now,
		lastError: null,
		lastEvent: `${message.type} received`,
		updatedAt: now,
	});

	if (message.type === "register") {
		recordRegisterMessage(message, now);
		return;
	}

	if (message.type === "heartbeat") {
		recordHeartbeatMessage(message, now);
		return;
	}

	if (message.type === "orientation") {
		recordOrientationMessage(message, now);
	}
}

export function recordM5DeviceDisconnected(deviceId: string): void {
	const status = readStatus();
	writeStatus({
		...status,
		connected: false,
		lastEvent: `Device disconnected: ${deviceId}`,
		updatedAt: Date.now(),
	});
}

export function recordM5BridgeError(error: string): void {
	const status = readStatus();
	writeStatus({
		...status,
		lastError: error,
		lastEvent: "Bridge error",
		updatedAt: Date.now(),
	});
}

function createInitialStatus(): M5BridgeStatus {
	return {
		bridgeListening: false,
		endpoint: null,
		connected: false,
		deviceId: null,
		firmwareVersion: null,
		capabilities: [],
		lastMessageAt: null,
		lastHeartbeatAt: null,
		lastOrientationAt: null,
		rssi: null,
		freeHeap: null,
		batteryVoltage: null,
		uptimeMs: null,
		calibrated: null,
		streaming: null,
		orientation: null,
		lastEvent: null,
		lastError: null,
		updatedAt: Date.now(),
	};
}

function recordRegisterMessage(message: M5RegisterMessage, now: number): void {
	const status = readStatus();
	writeStatus({
		...status,
		firmwareVersion: message.firmwareVersion,
		capabilities: [...message.capabilities],
		lastEvent: `Device registered: ${message.deviceId}`,
		updatedAt: now,
	});
}

function recordHeartbeatMessage(message: M5HeartbeatMessage, now: number): void {
	const status = readStatus();
	writeStatus({
		...status,
		lastHeartbeatAt: now,
		rssi: message.rssi ?? null,
		freeHeap: message.freeHeap ?? null,
		batteryVoltage: message.batteryVoltage ?? null,
		uptimeMs: message.uptimeMs ?? null,
		calibrated: message.calibrated ?? null,
		streaming: message.streaming ?? null,
		updatedAt: now,
	});
}

function recordOrientationMessage(
	message: M5OrientationMessage,
	now: number,
): void {
	const status = readStatus();
	writeStatus({
		...status,
		lastOrientationAt: now,
		orientation: {
			pitch: message.pitch,
			roll: message.roll,
			yaw: message.yaw ?? 0,
			quality: message.quality,
		},
		updatedAt: now,
	});
}

function readStatus(): M5BridgeStatus {
	const store = globalThis as typeof globalThis & M5StatusGlobal;
	store.__neuralFlightM5BridgeStatus ??= createInitialStatus();
	return store.__neuralFlightM5BridgeStatus;
}

function writeStatus(nextStatus: M5BridgeStatus): void {
	const store = globalThis as typeof globalThis & M5StatusGlobal;
	store.__neuralFlightM5BridgeStatus = nextStatus;
}
