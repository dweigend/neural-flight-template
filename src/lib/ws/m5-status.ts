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

let status: M5BridgeStatus = createInitialStatus();

export function getM5BridgeStatus(): M5BridgeStatus {
	return {
		...status,
		capabilities: [...status.capabilities],
		orientation: status.orientation ? { ...status.orientation } : null,
	};
}

export function recordM5BridgeListening(endpoint: string): void {
	status = {
		...status,
		bridgeListening: true,
		endpoint,
		lastEvent: "Bridge listening",
		updatedAt: Date.now(),
	};
}

export function recordM5BridgeClosed(): void {
	status = {
		...status,
		bridgeListening: false,
		connected: false,
		lastEvent: "Bridge closed",
		updatedAt: Date.now(),
	};
}

export function recordM5DeviceMessage(message: M5DeviceMessage): void {
	const now = Date.now();
	status = {
		...status,
		connected: true,
		deviceId: message.deviceId,
		lastMessageAt: now,
		lastError: null,
		lastEvent: `${message.type} received`,
		updatedAt: now,
	};

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
	status = {
		...status,
		connected: false,
		lastEvent: `Device disconnected: ${deviceId}`,
		updatedAt: Date.now(),
	};
}

export function recordM5BridgeError(error: string): void {
	status = {
		...status,
		lastError: error,
		lastEvent: "Bridge error",
		updatedAt: Date.now(),
	};
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
	status = {
		...status,
		firmwareVersion: message.firmwareVersion,
		capabilities: [...message.capabilities],
		lastEvent: `Device registered: ${message.deviceId}`,
		updatedAt: now,
	};
}

function recordHeartbeatMessage(message: M5HeartbeatMessage, now: number): void {
	status = {
		...status,
		lastHeartbeatAt: now,
		rssi: message.rssi,
		freeHeap: message.freeHeap,
		batteryVoltage: message.batteryVoltage,
		uptimeMs: message.uptimeMs,
		calibrated: message.calibrated,
		streaming: message.streaming,
		updatedAt: now,
	};
}

function recordOrientationMessage(
	message: M5OrientationMessage,
	now: number,
): void {
	status = {
		...status,
		lastOrientationAt: now,
		orientation: {
			pitch: message.pitch,
			roll: message.roll,
			yaw: message.yaw,
			quality: message.quality,
		},
		updatedAt: now,
	};
}
