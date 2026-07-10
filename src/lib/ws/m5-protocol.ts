export const M5_DEVICE_MESSAGE_TYPES = [
	"register",
	"heartbeat",
	"imu",
	"orientation",
] as const;

const M5_MIN_QUALITY = 0;
const M5_MAX_QUALITY = 1;

export type M5DeviceMessageType = (typeof M5_DEVICE_MESSAGE_TYPES)[number];
export type M5DeviceRole = "controller";

export interface M5Vector3 {
	x: number;
	y: number;
	z: number;
}

export interface M5BaseDeviceMessage {
	type: M5DeviceMessageType;
	deviceId: string;
	role: M5DeviceRole;
	// Optional: "minimal" firmware variants omit seq/timeMs/quality on some
	// frame types. They are validated only when present. Orientation frames
	// re-require `quality` (see M5OrientationMessage) because the bridge uses it.
	seq?: number;
	timeMs?: number;
	quality?: number;
}

type M5BaseDeviceRecord = M5BaseDeviceMessage & Record<string, unknown>;

export interface M5RegisterMessage extends M5BaseDeviceMessage {
	type: "register";
	firmwareVersion: string;
	capabilities: string[];
}

export interface M5HeartbeatMessage extends M5BaseDeviceMessage {
	type: "heartbeat";
	// All telemetry fields are optional: "minimal" firmware variants send a
	// reduced heartbeat (e.g. only rssi + uptimeMs). Heartbeats are status-only
	// (the bridge does not act on them), so missing fields surface as null.
	rssi?: number;
	freeHeap?: number;
	batteryVoltage?: number;
	uptimeMs?: number;
	calibrated?: boolean;
	streaming?: boolean;
}

export interface M5ImuMessage extends M5BaseDeviceMessage {
	type: "imu";
	accel: M5Vector3;
	gyro: M5Vector3;
}

export interface M5OrientationMessage extends M5BaseDeviceMessage {
	type: "orientation";
	pitch: number;
	roll: number;
	// Required for orientation: the bridge drops low-quality frames using it.
	quality: number;
	// Optional: "minimal" firmware variants omit yaw. The bridge ignores it;
	// it is only surfaced in the status panel (defaulted to 0 when absent).
	yaw?: number;
}

export type M5DeviceMessage =
	| M5RegisterMessage
	| M5HeartbeatMessage
	| M5ImuMessage
	| M5OrientationMessage;

export function parseM5DeviceMessage(raw: string): M5DeviceMessage {
	let data: unknown;

	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error("Invalid M5 message: invalid JSON");
	}

	if (isM5DeviceMessage(data)) return data;

	throw new Error(`Invalid M5 message: ${describeInvalidMessage(data)}`);
}

export function isM5DeviceMessage(data: unknown): data is M5DeviceMessage {
	return (
		isM5RegisterMessage(data) ||
		isM5HeartbeatMessage(data) ||
		isM5ImuMessage(data) ||
		isM5OrientationMessage(data)
	);
}

export function isM5RegisterMessage(
	data: unknown,
): data is M5RegisterMessage {
	if (!hasM5BaseFields(data, "register")) return false;
	return (
		isNonEmptyString(data.firmwareVersion) &&
		Array.isArray(data.capabilities) &&
		data.capabilities.every(isNonEmptyString)
	);
}

export function isM5HeartbeatMessage(
	data: unknown,
): data is M5HeartbeatMessage {
	if (!hasM5BaseFields(data, "heartbeat")) return false;
	return (
		isOptional(data.rssi, isFiniteNumber) &&
		isOptional(data.freeHeap, isFiniteNonNegativeNumber) &&
		isOptional(data.batteryVoltage, isFiniteNonNegativeNumber) &&
		isOptional(data.uptimeMs, isFiniteNonNegativeNumber) &&
		isOptional(data.calibrated, isBoolean) &&
		isOptional(data.streaming, isBoolean)
	);
}

export function isM5ImuMessage(data: unknown): data is M5ImuMessage {
	if (!hasM5BaseFields(data, "imu")) return false;
	return isM5Vector3(data.accel) && isM5Vector3(data.gyro);
}

export function isM5OrientationMessage(
	data: unknown,
): data is M5OrientationMessage {
	if (!hasM5BaseFields(data, "orientation")) return false;
	return (
		isFiniteNumber(data.pitch) &&
		isFiniteNumber(data.roll) &&
		isOptional(data.yaw, isFiniteNumber) &&
		isNumberInRange(data.quality, M5_MIN_QUALITY, M5_MAX_QUALITY)
	);
}

function hasM5BaseFields(
	data: unknown,
	type: M5DeviceMessageType,
): data is M5BaseDeviceRecord {
	return (
		isRecord(data) &&
		data.type === type &&
		isNonEmptyString(data.deviceId) &&
		data.role === "controller" &&
		isOptional(data.seq, isPositiveInteger) &&
		isOptional(data.timeMs, isFiniteNonNegativeNumber) &&
		isOptional(data.quality, isM5Quality)
	);
}

function isM5Quality(data: unknown): data is number {
	return isNumberInRange(data, M5_MIN_QUALITY, M5_MAX_QUALITY);
}

function isBoolean(data: unknown): data is boolean {
	return typeof data === "boolean";
}

function isM5Vector3(data: unknown): data is M5Vector3 {
	return (
		isRecord(data) &&
		isFiniteNumber(data.x) &&
		isFiniteNumber(data.y) &&
		isFiniteNumber(data.z)
	);
}

function describeInvalidMessage(data: unknown): string {
	if (!isRecord(data)) return "message must be a JSON object";
	if (typeof data.type !== "string") return "type must be a string";

	const baseReason = describeInvalidBaseFields(data);
	if (baseReason) return baseReason;

	if (data.type === "orientation") {
		const fieldReason =
			describeInvalidNumber(data, "pitch") ??
			describeInvalidNumber(data, "roll") ??
			describeInvalidOptionalNumber(data, "yaw");
		if (fieldReason) return fieldReason;
		if (!isM5Quality(data.quality))
			return `quality must be a number between ${M5_MIN_QUALITY} and ${M5_MAX_QUALITY} (got ${describeValue(data.quality)})`;
	}

	return `unsupported shape for type "${data.type}"`;
}

function describeInvalidBaseFields(data: Record<string, unknown>): string | null {
	if (!isNonEmptyString(data.deviceId))
		return `deviceId must be a non-empty string (got ${describeValue(data.deviceId)})`;
	if (data.role !== "controller")
		return `role must be "controller" (got ${describeValue(data.role)})`;
	if (!isOptional(data.seq, isPositiveInteger))
		return `seq must be a positive integer > 0 when present (got ${describeValue(data.seq)})`;
	if (!isOptional(data.timeMs, isFiniteNonNegativeNumber))
		return `timeMs must be a non-negative number when present (got ${describeValue(data.timeMs)})`;
	if (!isOptional(data.quality, isM5Quality))
		return `quality must be a number between ${M5_MIN_QUALITY} and ${M5_MAX_QUALITY} when present (got ${describeValue(data.quality)})`;
	return null;
}

function describeInvalidNumber(
	data: Record<string, unknown>,
	field: string,
): string | null {
	if (isFiniteNumber(data[field])) return null;
	return `${field} must be a finite number (got ${describeValue(data[field])})`;
}

function describeInvalidOptionalNumber(
	data: Record<string, unknown>,
	field: string,
): string | null {
	if (isOptional(data[field], isFiniteNumber)) return null;
	return `${field} must be a finite number when present (got ${describeValue(data[field])})`;
}

function describeValue(value: unknown): string {
	if (typeof value === "string") return JSON.stringify(value);
	if (value === undefined) return "undefined";
	return String(value);
}

function isRecord(data: unknown): data is Record<string, unknown> {
	return typeof data === "object" && data !== null;
}

function isOptional<T>(
	data: unknown,
	guard: (value: unknown) => value is T,
): data is T | undefined {
	return data === undefined || guard(data);
}

function isNonEmptyString(data: unknown): data is string {
	return typeof data === "string" && data.trim().length > 0;
}

function isFiniteNumber(data: unknown): data is number {
	return typeof data === "number" && Number.isFinite(data);
}

function isFiniteNonNegativeNumber(data: unknown): data is number {
	return isFiniteNumber(data) && data >= 0;
}

function isPositiveInteger(data: unknown): data is number {
	return typeof data === "number" && Number.isInteger(data) && data > 0;
}

function isNumberInRange(
	data: unknown,
	minimum: number,
	maximum: number,
): data is number {
	return isFiniteNumber(data) && data >= minimum && data <= maximum;
}
