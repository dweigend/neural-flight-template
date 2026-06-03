import type {
	ControllerMessage,
	M5BridgeSettingsUpdate,
	OrientationData,
	SettingsUpdate,
	SpeedCommand,
} from "$lib/types/orientation";

export function serializeMessage(msg: ControllerMessage): string {
	return JSON.stringify(msg);
}

/**
 * Parse and validate an incoming WebSocket message.
 *
 * 🧑‍💻 TODO (David): Implement the validation body below.
 *
 * Trade-offs to consider:
 * - Strict range checks (pitch/roll -90..90) catch bad sensor data
 *   but cost CPU on every 60Hz message
 * - Loose validation (just check `type` field exists) is faster
 *   but lets garbage through
 *
 * The parsed JSON is already available as `data`.
 * Throw an Error if the message is invalid.
 */
export function parseMessage(raw: string): ControllerMessage {
	const data: unknown = JSON.parse(raw);

	// ─── YOUR VALIDATION HERE (≈8 lines) ───
	// Check that `data` is a valid ControllerMessage.
	// Use isOrientationData() and isSpeedCommand() below,
	// or write inline checks — your call.
	//
	// Return the validated message or throw an Error.
	// ─────────────────────────────────────────

	if (isOrientationData(data)) return data;
	if (isSpeedCommand(data)) return data;
	if (isSettingsUpdate(data)) return data;
	if (isM5BridgeSettingsUpdate(data)) return data;

	throw new Error(
		`Invalid message: unknown type "${(data as Record<string, unknown>).type}"`,
	);
}

export function isOrientationData(data: unknown): data is OrientationData {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	return (
		d.type === "orientation" &&
		typeof d.pitch === "number" &&
		typeof d.roll === "number" &&
		typeof d.timestamp === "number"
	);
}

export function isSpeedCommand(data: unknown): data is SpeedCommand {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	return (
		d.type === "speed" &&
		(d.action === "accelerate" || d.action === "brake") &&
		typeof d.active === "boolean" &&
		typeof d.timestamp === "number"
	);
}

export function isSettingsUpdate(data: unknown): data is SettingsUpdate {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	return (
		d.type === "settings" &&
		typeof d.settings === "object" &&
		d.settings !== null &&
		typeof d.timestamp === "number"
	);
}

export function isM5BridgeSettingsUpdate(
	data: unknown,
): data is M5BridgeSettingsUpdate {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	if (
		d.type !== "m5-settings" ||
		typeof d.settings !== "object" ||
		d.settings === null ||
		typeof d.timestamp !== "number"
	) {
		return false;
	}

	return Object.values(d.settings).every(
		(value) => typeof value === "number" || typeof value === "boolean",
	);
}
