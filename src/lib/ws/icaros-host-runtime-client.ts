/**
 * Purpose: browser-side runtime registration client for Icaros Host.
 * Boundary: registers one concrete experience instance on `/ws/runtime` so the
 * Host can expose it through `/launch`. It does not carry control data.
 */
import { browser } from "$app/environment";
import type { ConnectionStatus, WebSocketClientOptions } from "$lib/types/websocket";

export interface IcarosHostRuntimeClientOptions extends WebSocketClientOptions {
	hostOrigin?: string;
	runtimePath?: string;
	experienceId: string;
	title?: string;
	clientId?: string;
}

export interface StationState {
	selectedExperienceId: string | null;
	selectedLaunchClientId: string | null;
}

interface IcarosHostRuntimeClient {
	status: ConnectionStatus;
	start: () => void;
	disconnect: () => void;
	onStationState: (listener: (state: StationState) => void) => () => void;
}

type RuntimeMessageType =
	| "client.hello"
	| "client.heartbeat"
	| "client.registered"
	| "client.rejected"
	| "station.state"
	| "runtime.clients";

const DEFAULTS: Required<WebSocketClientOptions> = {
	autoReconnect: true,
	maxReconnects: 5,
	reconnectDelay: 1000,
};

const HEARTBEAT_INTERVAL_MS = 4_000;

const NOOP_CLIENT: IcarosHostRuntimeClient = {
	status: "disconnected",
	start: () => {},
	disconnect: () => {},
	onStationState: () => () => {},
};

export function createIcarosHostRuntimeClient(
	options: IcarosHostRuntimeClientOptions,
): IcarosHostRuntimeClient {
	if (!browser) return NOOP_CLIENT;

	const opts = { ...DEFAULTS, ...options };
	const listeners = new Set<(state: StationState) => void>();
	const clientId = options.clientId ?? readStableClientId();
	const title = options.title?.trim() || document.title.trim() || options.experienceId;

	let ws: WebSocket | null = null;
	let reconnectCount = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let manuallyStopped = false;
	let status: ConnectionStatus = "disconnected";

	function connect(): void {
		clearReconnectTimer();
		status = "connecting";

		try {
			ws = new WebSocket(resolveRuntimeSocketUrl(opts));
		} catch (error) {
			status = "error";
			console.warn("[IcarosHostRuntime] Could not open runtime socket", error);
			maybeReconnect();
			return;
		}

		ws.onopen = () => {
			status = "connected";
			reconnectCount = 0;
			sendHello();
		};

		ws.onmessage = (event: MessageEvent) => {
			handleMessage(String(event.data));
		};

		ws.onclose = () => {
			stopHeartbeat();
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

	function handleMessage(raw: string): void {
		const message = readRuntimeMessage(raw);
		if (message === null) return;

		switch (message.type) {
			case "client.registered":
				if (message.payload.clientId === clientId) {
					startHeartbeat();
				}
				break;
			case "client.rejected":
				console.warn("[IcarosHostRuntime] Client registration rejected", message.payload);
				ws?.close();
				break;
			case "station.state":
				{
					const state = readStationState(message.payload);
					if (state === null) {
						break;
					}
					for (const listener of listeners) {
						listener(state);
					}
				}
				break;
			default:
				break;
		}
	}

	function sendHello(): void {
		if (ws?.readyState !== WebSocket.OPEN) return;
		ws.send(
			JSON.stringify(
				createRuntimeMessage("client.hello", {
					role: "experience",
					clientId,
					experienceId: options.experienceId,
					title,
					url: window.location.href,
					userAgent: window.navigator.userAgent,
				}, clientId),
			),
		);
	}

	function startHeartbeat(): void {
		stopHeartbeat();
		heartbeatTimer = setInterval(() => {
			if (ws?.readyState !== WebSocket.OPEN) return;
			ws.send(
				JSON.stringify(
					createRuntimeMessage(
						"client.heartbeat",
						{ clientId },
						clientId,
					),
				),
			);
		}, HEARTBEAT_INTERVAL_MS);
	}

	function stopHeartbeat(): void {
		if (heartbeatTimer !== null) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
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
		start(): void {
			manuallyStopped = false;
			if (ws !== null || reconnectTimer !== null) return;
			connect();
		},
		disconnect(): void {
			manuallyStopped = true;
			clearReconnectTimer();
			stopHeartbeat();
			ws?.close();
			ws = null;
			status = "disconnected";
		},
		onStationState(listener: (state: StationState) => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

function resolveRuntimeSocketUrl(options: IcarosHostRuntimeClientOptions): string {
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
	parsedOrigin.pathname = options.runtimePath ?? "/ws/runtime";
	parsedOrigin.search = "";
	parsedOrigin.hash = "";
	return parsedOrigin.toString();
}

function createRuntimeMessage(
	type: RuntimeMessageType,
	payload: Record<string, unknown>,
	sourceId: string,
): Record<string, unknown> {
	return {
		protocol: "neural-flight.v1",
		type,
		stationId: "station-a",
		source: {
			role: "experience",
			id: sourceId,
		},
		timestamp: Date.now(),
		payload,
	};
}

function readRuntimeMessage(raw: string): {
	type: RuntimeMessageType;
	payload: Record<string, unknown>;
} | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || typeof parsed.type !== "string" || !isRecord(parsed.payload)) {
			return null;
		}

		if (!isRuntimeMessageType(parsed.type)) {
			return null;
		}

		return {
			type: parsed.type,
			payload: parsed.payload,
		};
	} catch {
		return null;
	}
}

function readStationState(payload: Record<string, unknown>): StationState | null {
	const selectedExperienceId =
		payload.selectedExperienceId === null || typeof payload.selectedExperienceId === "string"
			? payload.selectedExperienceId
			: undefined;
	const selectedLaunchClientId =
		payload.selectedLaunchClientId === null || typeof payload.selectedLaunchClientId === "string"
			? payload.selectedLaunchClientId
			: undefined;

	if (selectedExperienceId === undefined || selectedLaunchClientId === undefined) {
		return null;
	}

	return {
		selectedExperienceId,
		selectedLaunchClientId,
	};
}

function isRuntimeMessageType(value: string): value is RuntimeMessageType {
	return (
		value === "client.hello" ||
		value === "client.heartbeat" ||
		value === "client.registered" ||
		value === "client.rejected" ||
		value === "station.state" ||
		value === "runtime.clients"
	);
}

function readPublicHostOrigin(): string {
	const candidate = import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN;
	return typeof candidate === "string" ? candidate : "";
}

function readStableClientId(): string {
	try {
		const existing = window.localStorage.getItem("icaros.clientId");
		if (existing !== null && existing.trim() !== "") {
			return existing;
		}

		const next = globalThis.crypto.randomUUID();
		window.localStorage.setItem("icaros.clientId", next);
		return next;
	} catch {
		return globalThis.crypto.randomUUID();
	}
}

function isRecord(data: unknown): data is Record<string, unknown> {
	return typeof data === "object" && data !== null;
}
