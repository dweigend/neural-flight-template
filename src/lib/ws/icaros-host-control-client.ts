/**
 * Purpose: browser-side client for Icaros Host normalized control input.
 * Boundary: reads only `control.orientation` from `/ws/control/main` and does
 * not know about local controller routes, raw M5 frames, or launch selection.
 */
import { browser } from "$app/environment";
import type { ConnectionStatus, WebSocketClientOptions } from "$lib/types/websocket";

export interface HostControlOrientation {
	type: "control.orientation";
	pitch: number;
	roll: number;
	quality: number;
	controllerType: "m5";
	timestamp: number;
}

export interface IcarosHostControlClientOptions extends WebSocketClientOptions {
	hostOrigin?: string;
	controlPath?: string;
}

interface IcarosHostControlClient {
	status: ConnectionStatus;
	lastOrientation: HostControlOrientation | null;
	start: () => void;
	disconnect: () => void;
	onOrientation: (
		listener: (orientation: HostControlOrientation) => void,
	) => () => void;
}

const DEFAULTS: Required<WebSocketClientOptions> = {
	autoReconnect: true,
	maxReconnects: 5,
	reconnectDelay: 1000,
};

const NOOP_CLIENT: IcarosHostControlClient = {
	status: "disconnected",
	lastOrientation: null,
	start: () => {},
	disconnect: () => {},
	onOrientation: () => () => {},
};

export function createIcarosHostControlClient(
	options: IcarosHostControlClientOptions = {},
): IcarosHostControlClient {
	if (!browser) return NOOP_CLIENT;

	const opts = { ...DEFAULTS, ...options };
	const listeners = new Set<(orientation: HostControlOrientation) => void>();

	let ws: WebSocket | null = null;
	let reconnectCount = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let manuallyStopped = false;
	let status: ConnectionStatus = "disconnected";
	let lastOrientation: HostControlOrientation | null = null;

	function connect(): void {
		clearReconnectTimer();
		status = "connecting";

		try {
			ws = new WebSocket(resolveControlSocketUrl(opts));
		} catch (error) {
			status = "error";
			console.warn("[IcarosHostControl] Could not open control socket", error);
			maybeReconnect();
			return;
		}

		ws.onopen = () => {
			status = "connected";
			reconnectCount = 0;
		};

		ws.onmessage = (event: MessageEvent) => {
			const orientation = readOrientationMessage(String(event.data));
			if (orientation === null) return;

			lastOrientation = orientation;
			for (const listener of listeners) {
				listener(orientation);
			}
		};

		ws.onclose = () => {
			ws = null;
			status = "disconnected";
			if (!manuallyStopped) {
				maybeReconnect();
			}
		};

		ws.onerror = () => {
			status = "error";
		};
	}

	function maybeReconnect(): void {
		if (!opts.autoReconnect || reconnectCount >= opts.maxReconnects) return;
		reconnectCount += 1;
		const delay = opts.reconnectDelay * 2 ** (reconnectCount - 1);
		reconnectTimer = setTimeout(connect, delay);
	}

	function clearReconnectTimer(): void {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	return {
		get status() {
			return status;
		},
		get lastOrientation() {
			return lastOrientation;
		},
		start(): void {
			manuallyStopped = false;
			if (ws !== null || reconnectTimer !== null) return;
			connect();
		},
		disconnect(): void {
			manuallyStopped = true;
			clearReconnectTimer();
			ws?.close();
			ws = null;
			status = "disconnected";
		},
		onOrientation(
			listener: (orientation: HostControlOrientation) => void,
		): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

function resolveControlSocketUrl(options: IcarosHostControlClientOptions): string {
	const envOrigin = readPublicHostOrigin();
	const origin = (options.hostOrigin ?? envOrigin).trim();
	if (origin === "") {
		throw new Error(
			"Missing Icaros Host origin. Set PUBLIC_ICAROS_HOST_ORIGIN or pass hostOrigin.",
		);
	}

	const parsedOrigin = new URL(origin);
	if (parsedOrigin.protocol !== "https:") {
		throw new Error("Icaros Host origin must use https://");
	}

	parsedOrigin.protocol = "wss:";
	parsedOrigin.pathname = options.controlPath ?? "/ws/control/main";
	parsedOrigin.search = "";
	parsedOrigin.hash = "";
	return parsedOrigin.toString();
}

function readPublicHostOrigin(): string {
	const candidate = import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN;
	return typeof candidate === "string" ? candidate : "";
}

function readOrientationMessage(raw: string): HostControlOrientation | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || parsed.type !== "control.orientation") {
			return null;
		}

		const payload = parsed.payload;
		if (!isControlOrientationPayload(payload)) {
			return null;
		}

		return {
			type: "control.orientation",
			pitch: payload.pitch,
			roll: payload.roll,
			quality: payload.quality,
			controllerType: payload.controllerType,
			timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
		};
	} catch {
		return null;
	}
}

function isControlOrientationPayload(
	data: unknown,
): data is Omit<HostControlOrientation, "type" | "timestamp"> {
	return (
		isRecord(data) &&
		typeof data.pitch === "number" &&
		Number.isFinite(data.pitch) &&
		typeof data.roll === "number" &&
		Number.isFinite(data.roll) &&
		typeof data.quality === "number" &&
		Number.isFinite(data.quality) &&
		data.controllerType === "m5"
	);
}

function isRecord(data: unknown): data is Record<string, unknown> {
	return typeof data === "object" && data !== null;
}
