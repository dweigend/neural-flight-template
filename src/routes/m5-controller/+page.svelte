<script lang="ts">
import { Slider, Switch } from "bits-ui";
import {
	Activity,
	AlertTriangle,
	Battery,
	CheckCircle,
	KeyRound,
	RadioTower,
	RotateCcw,
	Save,
	Signal,
	SlidersHorizontal,
	Target,
	Usb,
	Wifi,
} from "lucide-svelte";
import { onDestroy, onMount } from "svelte";
import M5MountingPreview from "$lib/components/M5MountingPreview.svelte";
import PageHeader from "$lib/components/PageHeader.svelte";
import {
	M5_BRIDGE,
	type M5BridgeRuntimeConfig,
} from "$lib/config/flight";
import { createWebSocketClient } from "$lib/ws/client.svelte";
import type { M5BridgeStatus } from "$lib/ws/m5-status";

type NumberSettingKey =
	| "qualityThreshold"
	| "deadzoneDegrees"
	| "pitchDeadzoneDegrees"
	| "rollDeadzoneDegrees"
	| "smoothingAlpha"
	| "smoothingAmount"
	| "pitchScale"
	| "rollScale"
	| "maxPitch"
	| "maxRoll"
	| "staleTimeoutMs";

type BooleanSettingKey =
	| "invertPitch"
	| "invertRoll"
	| "mountingPitchUsesRoll"
	| "mountingRollUsesPitch";

interface NumberControl {
	key: NumberSettingKey;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

interface BooleanControl {
	key: BooleanSettingKey;
	label: string;
}

interface ConfigureRequest {
	type: "configure";
	ssid: string;
	password: string;
	serverUrl: string;
	deviceId: string;
}

interface ConfigureResult {
	type: "configureResult";
	ok: boolean;
	message: string;
}

interface SerialLike {
	requestPort: (options?: {
		filters?: SerialPortFilterLike[];
	}) => Promise<SerialPortLike>;
}

interface SerialPortFilterLike {
	usbVendorId: number;
	usbProductId?: number;
}

interface SerialPortLike {
	readable: ReadableStream<Uint8Array> | null;
	writable: WritableStream<Uint8Array> | null;
	open: (options: { baudRate: number }) => Promise<void>;
	close: () => Promise<void>;
}

interface NavigatorWithSerial extends Navigator {
	serial?: SerialLike;
}

type ConfigureStatus = "idle" | "busy" | "success" | "error";
type CalibrationStepId = "neutral" | "up" | "down" | "right" | "left";
type CalibrationStatus = "idle" | "running" | "complete" | "error";
type CalibrationAxis = "pitch" | "roll";

interface CalibrationStep {
	id: CalibrationStepId;
	label: string;
	detail: string;
}

interface CalibrationSample {
	pitch: number;
	roll: number;
}

interface CalibrationValues {
	neutralPitch: number;
	neutralRoll: number;
	upPitch: number;
	downPitch: number;
	rightRoll: number;
	leftRoll: number;
	pitchAxis: CalibrationAxis;
	rollAxis: CalibrationAxis;
}

const M5_SERIAL_PORT_FILTERS: SerialPortFilterLike[] = [
	{ usbVendorId: 0x1a86, usbProductId: 0x55d4 },
	{ usbVendorId: 0x1a86, usbProductId: 0x7523 },
	{ usbVendorId: 0x1a86 },
	{ usbVendorId: 0x10c4 },
];

const SERIAL_BAUD_RATE = 115_200;
const CONFIGURE_RESULT_TIMEOUT_MS = 5000;
const STATUS_POLL_INTERVAL_MS = 1000;
const CALIBRATION_STEP_MS = 5000;
const CALIBRATION_POLL_MS = 100;

const calibrationSteps: CalibrationStep[] = [
	{
		id: "neutral",
		label: "Neutral position",
		detail: "Hold the ICAROS steady in the normal centered riding position.",
	},
	{
		id: "up",
		label: "Maximum up",
		detail: "Move to the maximum up position and hold the strongest point.",
	},
	{
		id: "down",
		label: "Maximum down",
		detail: "Move to the maximum down position and hold the strongest point.",
	},
	{
		id: "right",
		label: "Maximum right",
		detail: "Move to the maximum right position and hold the strongest point.",
	},
	{
		id: "left",
		label: "Maximum left",
		detail: "Move to the maximum left position and hold the strongest point.",
	},
];

const defaults: M5BridgeRuntimeConfig = {
	qualityThreshold: M5_BRIDGE.QUALITY_THRESHOLD,
	deadzoneDegrees: M5_BRIDGE.DEADZONE_DEGREES,
	pitchDeadzoneDegrees: M5_BRIDGE.PITCH_DEADZONE_DEGREES,
	rollDeadzoneDegrees: M5_BRIDGE.ROLL_DEADZONE_DEGREES,
	smoothingAlpha: M5_BRIDGE.SMOOTHING_ALPHA,
	smoothingAmount: M5_BRIDGE.SMOOTHING_AMOUNT,
	pitchScale: M5_BRIDGE.PITCH_SCALE,
	rollScale: M5_BRIDGE.ROLL_SCALE,
	invertPitch: M5_BRIDGE.INVERT_PITCH,
	invertRoll: M5_BRIDGE.INVERT_ROLL,
	mountingPitchUsesRoll: M5_BRIDGE.MOUNTING_PITCH_USES_ROLL,
	mountingRollUsesPitch: M5_BRIDGE.MOUNTING_ROLL_USES_PITCH,
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
	calibrationPitchUsesRoll: false,
	calibrationRollUsesPitch: false,
};

const motionControls: NumberControl[] = [
	{
		key: "pitchDeadzoneDegrees",
		label: "Pitch dead zone",
		min: 0,
		max: 10,
		step: 0.25,
		unit: "deg",
	},
	{
		key: "rollDeadzoneDegrees",
		label: "Roll dead zone",
		min: 0,
		max: 10,
		step: 0.25,
		unit: "deg",
	},
	{
		key: "smoothingAmount",
		label: "Smoothing",
		min: 0,
		max: 0.95,
		step: 0.05,
		unit: "",
	},
	{
		key: "smoothingAlpha",
		label: "Response",
		min: 0.05,
		max: 1,
		step: 0.05,
		unit: "",
	},
	{
		key: "pitchScale",
		label: "Pitch scale",
		min: 0.25,
		max: 2,
		step: 0.05,
		unit: "x",
	},
	{
		key: "rollScale",
		label: "Roll scale",
		min: 0.25,
		max: 2,
		step: 0.05,
		unit: "x",
	},
	{
		key: "maxPitch",
		label: "Pitch clamp",
		min: 5,
		max: 90,
		step: 1,
		unit: "deg",
	},
	{
		key: "maxRoll",
		label: "Roll clamp",
		min: 5,
		max: 90,
		step: 1,
		unit: "deg",
	},
];

const safetyControls: NumberControl[] = [
	{
		key: "qualityThreshold",
		label: "Quality threshold",
		min: 0,
		max: 1,
		step: 0.05,
		unit: "",
	},
	{
		key: "staleTimeoutMs",
		label: "Stale timeout",
		min: 500,
		max: 10_000,
		step: 100,
		unit: "ms",
	},
];

const axisControls: BooleanControl[] = [
	{ key: "invertPitch", label: "Invert pitch" },
	{ key: "invertRoll", label: "Invert roll" },
];

const mountingControls: BooleanControl[] = [
	{ key: "mountingPitchUsesRoll", label: "Pitch uses M5 roll" },
	{ key: "mountingRollUsesPitch", label: "Roll uses M5 pitch" },
];

const ws = createWebSocketClient();

let settings = $state<M5BridgeRuntimeConfig>({ ...defaults });
let lastSentAt = $state<number | null>(null);
let bridgeStatus = $state<M5BridgeStatus | null>(null);
let statusError = $state<string | null>(null);
let currentTime = $state(Date.now());
let ssid = $state("");
let password = $state("");
let serverUrl = $state(getDeviceEndpoint());
let deviceId = $state("m5stick-plus2-001");
let configureStatus = $state<ConfigureStatus>("idle");
let configureMessage = $state("Plug in the M5Stick over USB before changing WiFi.");
let calibrationStatus = $state<CalibrationStatus>("idle");
let calibrationStepIndex = $state(0);
let calibrationRemainingMs = $state(CALIBRATION_STEP_MS);
let calibrationMessage = $state("Ready to calibrate the mounted controller.");
let calibrationValues = $state<CalibrationValues | null>(null);
let calibrationSamples = new Map<CalibrationStepId, CalibrationSample[]>();
let calibrationTimer: ReturnType<typeof setTimeout> | null = null;
let calibrationNeutral: CalibrationSample | null = null;

const deviceEndpoint = $derived(getDeviceEndpoint());
const isLocalHost = $derived(isLocalHostName());
const currentCalibrationStep = $derived(
	calibrationSteps[calibrationStepIndex] ?? calibrationSteps[0],
);
const calibrationProgress = $derived(
	Math.max(
		0,
		Math.min(1, (CALIBRATION_STEP_MS - calibrationRemainingMs) / CALIBRATION_STEP_MS),
	),
);
const canConfigure = $derived(
	ssid.trim().length > 0 &&
	serverUrl.trim().length > 0 &&
	deviceId.trim().length > 0 &&
	configureStatus !== "busy",
);
const lastMessageAgeMs = $derived(
	bridgeStatus?.lastMessageAt ? currentTime - bridgeStatus.lastMessageAt : null,
);
const lastHeartbeatAgeMs = $derived(
	bridgeStatus?.lastHeartbeatAt
		? currentTime - bridgeStatus.lastHeartbeatAt
		: null,
);

function getDeviceEndpoint(): string {
	if (typeof window === "undefined") return "ws://MAC_LAN_IP:8787/ws/device";
	return `ws://${window.location.hostname}:8787/ws/device`;
}

function isLocalHostName(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1" ||
		window.location.hostname === "::1"
	);
}

function setNumber(key: NumberSettingKey, value: number): void {
	settings = { ...settings, [key]: value };
	void sendSettings({ [key]: value });
}

function setBoolean(key: BooleanSettingKey, value: boolean): void {
	settings = { ...settings, [key]: value };
	void sendSettings({ [key]: value });
}

async function sendSettings(
	update: Record<string, number | boolean>,
): Promise<void> {
	try {
		const response = await fetch("/api/m5/settings", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(update),
		});
		if (!response.ok) {
			throw new Error(`Settings request failed: ${response.status}`);
		}
		const nextSettings = (await response.json()) as M5BridgeRuntimeConfig;
		applyRuntimeSettings(nextSettings);
		lastSentAt = Date.now();
		statusError = null;
	} catch (error) {
		statusError =
			error instanceof Error ? error.message : "Could not apply M5 settings.";
	}
}

function resetDefaults(): void {
	settings = { ...defaults };
	void sendSettings({ ...defaults });
	calibrationValues = null;
	calibrationStatus = "idle";
	calibrationMessage = "Calibration reset.";
}

function formatValue(value: number, step: number, unit: string): string {
	const decimals = step < 1 ? 2 : 0;
	return `${value.toFixed(decimals)}${unit}`;
}

async function refreshStatus(): Promise<M5BridgeStatus | null> {
	try {
		const response = await fetch("/api/m5/status");
		if (!response.ok) {
			throw new Error(`Status request failed: ${response.status}`);
		}
		const nextStatus = (await response.json()) as M5BridgeStatus;
		bridgeStatus = nextStatus;
		statusError = null;
		return nextStatus;
	} catch (error) {
		statusError =
			error instanceof Error ? error.message : "Could not read M5 status.";
		return null;
	}
}

async function refreshRuntimeSettings(): Promise<void> {
	try {
		const response = await fetch("/api/m5/settings");
		if (!response.ok) {
			throw new Error(`Settings request failed: ${response.status}`);
		}
		const nextSettings = (await response.json()) as M5BridgeRuntimeConfig;
		applyRuntimeSettings(nextSettings);
		statusError = null;
	} catch (error) {
		statusError =
			error instanceof Error ? error.message : "Could not read M5 settings.";
	}
}

function applyRuntimeSettings(nextSettings: M5BridgeRuntimeConfig): void {
	settings = { ...nextSettings };
	if (nextSettings.calibrationEnabled) {
		calibrationValues = calibrationValuesFromSettings(nextSettings);
		calibrationStatus = "complete";
		calibrationMessage = "Runtime calibration loaded.";
	} else if (calibrationStatus === "complete") {
		calibrationValues = null;
		calibrationStatus = "idle";
		calibrationMessage = "Ready to calibrate the mounted controller.";
	}
}

function calibrationValuesFromSettings(
	nextSettings: M5BridgeRuntimeConfig,
): CalibrationValues {
	return {
		neutralPitch: nextSettings.calibrationNeutralPitch,
		neutralRoll: nextSettings.calibrationNeutralRoll,
		upPitch: nextSettings.calibrationUpPitch,
		downPitch: nextSettings.calibrationDownPitch,
		rightRoll: nextSettings.calibrationRightRoll,
		leftRoll: nextSettings.calibrationLeftRoll,
		pitchAxis: nextSettings.calibrationPitchUsesRoll ? "roll" : "pitch",
		rollAxis: nextSettings.calibrationRollUsesPitch ? "pitch" : "roll",
	};
}

async function startCalibration(): Promise<void> {
	const status = await refreshStatus();
	if (!status?.connected) {
		calibrationStatus = "error";
		calibrationMessage = "Connect the M5Stick before starting calibration.";
		return;
	}

	clearCalibrationTimer();
	calibrationSamples = createCalibrationSamples();
	calibrationNeutral = null;
	calibrationValues = null;
	calibrationStatus = "running";
	calibrationStepIndex = 0;
	calibrationRemainingMs = CALIBRATION_STEP_MS;
	calibrationMessage = "Calibration started.";
	runCalibrationStep(Date.now());
}

function cancelCalibration(): void {
	clearCalibrationTimer();
	calibrationStatus = "idle";
	calibrationMessage = "Calibration cancelled.";
	calibrationRemainingMs = CALIBRATION_STEP_MS;
}

function useRawM5Readout(): void {
	clearCalibrationTimer();
	calibrationValues = null;
	calibrationStatus = "idle";
	calibrationMessage = "Using raw M5 readout. Mounting controls still apply.";
	settings = {
		...settings,
		calibrationEnabled: false,
	};
	void sendSettings({ calibrationEnabled: false });
}

function runCalibrationStep(stepStartedAt: number): void {
	const step = calibrationSteps[calibrationStepIndex];
	if (!step) {
		finishCalibration();
		return;
	}

	calibrationTimer = setTimeout(async () => {
		currentTime = Date.now();
		const status = await refreshStatus();
		sampleCalibrationStep(step.id, status);

		const elapsedMs = Date.now() - stepStartedAt;
		calibrationRemainingMs = Math.max(0, CALIBRATION_STEP_MS - elapsedMs);

		if (elapsedMs >= CALIBRATION_STEP_MS) {
			if (!finishCalibrationStep(step.id)) return;
			calibrationStepIndex += 1;
			calibrationRemainingMs = CALIBRATION_STEP_MS;
			runCalibrationStep(Date.now());
			return;
		}

		runCalibrationStep(stepStartedAt);
	}, CALIBRATION_POLL_MS);
}

function sampleCalibrationStep(
	stepId: CalibrationStepId,
	status: M5BridgeStatus | null,
): void {
	const orientation = status?.orientation;
	if (!orientation) return;
	const samples = calibrationSamples.get(stepId);
	if (!samples) return;

	samples.push({
		pitch: orientation.pitch,
		roll: orientation.roll,
	});
}

function finishCalibrationStep(stepId: CalibrationStepId): boolean {
	const samples = calibrationSamples.get(stepId) ?? [];
	if (samples.length === 0) {
		calibrationStatus = "error";
		calibrationMessage = "No M5 orientation samples received during calibration.";
		clearCalibrationTimer();
		return false;
	}

	if (stepId === "neutral") {
		calibrationNeutral = averageSample(samples);
	}

	return true;
}

function finishCalibration(): void {
	clearCalibrationTimer();

	if (!calibrationNeutral) {
		calibrationStatus = "error";
		calibrationMessage = "Neutral calibration was not captured.";
		return;
	}

	const values = buildCalibrationValues(calibrationNeutral);
	if (!values) {
		calibrationStatus = "error";
		calibrationMessage = "Calibration did not capture enough movement.";
		return;
	}

	calibrationValues = values;
	calibrationStatus = "complete";
	calibrationMessage = "Calibration applied.";
	settings = {
		...settings,
		calibrationEnabled: true,
		calibrationNeutralPitch: values.neutralPitch,
		calibrationNeutralRoll: values.neutralRoll,
		calibrationUpPitch: values.upPitch,
		calibrationDownPitch: values.downPitch,
		calibrationRightRoll: values.rightRoll,
		calibrationLeftRoll: values.leftRoll,
		calibrationPitchUsesRoll: values.pitchAxis === "roll",
		calibrationRollUsesPitch: values.rollAxis === "pitch",
	};
	void sendSettings({
		calibrationEnabled: true,
		calibrationNeutralPitch: values.neutralPitch,
		calibrationNeutralRoll: values.neutralRoll,
		calibrationUpPitch: values.upPitch,
		calibrationDownPitch: values.downPitch,
		calibrationRightRoll: values.rightRoll,
		calibrationLeftRoll: values.leftRoll,
		calibrationPitchUsesRoll: values.pitchAxis === "roll",
		calibrationRollUsesPitch: values.rollAxis === "pitch",
	});
}

function buildCalibrationValues(
	neutral: CalibrationSample,
): CalibrationValues | null {
	const pitchAxis = chooseDominantAxis("down", "up", neutral);
	const rollAxis = chooseDominantAxis("right", "left", neutral);
	const pitchNeutral = neutral[pitchAxis];
	const rollNeutral = neutral[rollAxis];
	const upPitch = extremeAxisValue("up", pitchAxis, pitchNeutral);
	const downPitch = extremeAxisValue("down", pitchAxis, pitchNeutral);
	const rightRoll = extremeAxisValue("right", rollAxis, rollNeutral);
	const leftRoll = extremeAxisValue("left", rollAxis, rollNeutral);

	if (
		upPitch === null ||
		downPitch === null ||
		rightRoll === null ||
		leftRoll === null
	) {
		return null;
	}

	return {
		neutralPitch: pitchNeutral,
		neutralRoll: rollNeutral,
		upPitch,
		downPitch,
		rightRoll,
		leftRoll,
		pitchAxis,
		rollAxis,
	};
}

function chooseDominantAxis(
	positiveStepId: CalibrationStepId,
	negativeStepId: CalibrationStepId,
	neutral: CalibrationSample,
): CalibrationAxis {
	const pitchMotion = Math.max(
		axisMotion(positiveStepId, "pitch", neutral.pitch),
		axisMotion(negativeStepId, "pitch", neutral.pitch),
	);
	const rollMotion = Math.max(
		axisMotion(positiveStepId, "roll", neutral.roll),
		axisMotion(negativeStepId, "roll", neutral.roll),
	);

	return rollMotion > pitchMotion ? "roll" : "pitch";
}

function axisMotion(
	stepId: CalibrationStepId,
	axis: CalibrationAxis,
	neutralValue: number,
): number {
	const extremeValue = extremeAxisValue(stepId, axis, neutralValue);
	return extremeValue === null ? 0 : Math.abs(extremeValue - neutralValue);
}

function extremeAxisValue(
	stepId: CalibrationStepId,
	axis: CalibrationAxis,
	neutralValue: number,
): number | null {
	const samples = calibrationSamples.get(stepId) ?? [];
	if (samples.length === 0) return null;

	let extremeValue = samples[0][axis];
	let extremeDistance = Math.abs(extremeValue - neutralValue);

	for (const sample of samples) {
		const value = sample[axis];
		const distance = Math.abs(value - neutralValue);
		if (distance > extremeDistance) {
			extremeValue = value;
			extremeDistance = distance;
		}
	}

	return extremeValue;
}

function averageSample(samples: CalibrationSample[]): CalibrationSample {
	const total = samples.reduce(
		(sum, sample) => ({
			pitch: sum.pitch + sample.pitch,
			roll: sum.roll + sample.roll,
		}),
		{ pitch: 0, roll: 0 },
	);

	return {
		pitch: total.pitch / samples.length,
		roll: total.roll / samples.length,
	};
}

function createCalibrationSamples(): Map<CalibrationStepId, CalibrationSample[]> {
	return new Map<CalibrationStepId, CalibrationSample[]>(
		calibrationSteps.map((step) => [step.id, []]),
	);
}

function clearCalibrationTimer(): void {
	if (!calibrationTimer) return;
	clearTimeout(calibrationTimer);
	calibrationTimer = null;
}

async function configureWifi(): Promise<void> {
	const serial = getSerial();
	if (!serial) {
		configureStatus = "error";
		configureMessage =
			"Web Serial is unavailable. Use Chrome or Edge and plug in the M5Stick over USB.";
		return;
	}

	configureStatus = "busy";
	configureMessage = "Opening USB serial connection.";

	try {
		const port = await serial.requestPort({ filters: M5_SERIAL_PORT_FILTERS });
		await port.open({ baudRate: SERIAL_BAUD_RATE });
		const result = await sendConfigureRequest(port, {
			type: "configure",
			ssid: ssid.trim(),
			password,
			serverUrl: serverUrl.trim(),
			deviceId: deviceId.trim(),
		});

		configureStatus = result?.ok ? "success" : "error";
		configureMessage =
			result?.message ?? "Configuration sent, but no configureResult was received.";
	} catch (error) {
		configureStatus = "error";
		configureMessage =
			error instanceof Error ? error.message : "Could not configure M5 WiFi.";
	}
}

function getSerial(): SerialLike | null {
	if (typeof navigator === "undefined") return null;
	return (navigator as NavigatorWithSerial).serial ?? null;
}

async function sendConfigureRequest(
	port: SerialPortLike,
	request: ConfigureRequest,
): Promise<ConfigureResult | null> {
	const writer = port.writable?.getWriter();
	const reader = port.readable?.getReader();

	if (!writer || !reader) {
		writer?.releaseLock();
		if (reader) {
			await reader.cancel();
			reader.releaseLock();
		}
		await port.close();
		throw new Error("USB serial port is not readable and writable.");
	}

	try {
		const payload = `${JSON.stringify(request)}\n`;
		await writer.write(new TextEncoder().encode(payload));
		return await readConfigureResult(reader);
	} finally {
		writer.releaseLock();
		await reader.cancel();
		reader.releaseLock();
		await port.close();
	}
}

async function readConfigureResult(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ConfigureResult | null> {
	const decoder = new TextDecoder();
	let buffer = "";
	const deadline = Date.now() + CONFIGURE_RESULT_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const remainingMs = deadline - Date.now();
		const result = await readWithTimeout(reader, remainingMs);
		if (!result || result.done) return null;

		buffer += decoder.decode(result.value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			const configureResult = parseConfigureResult(line);
			if (configureResult) return configureResult;
		}
	}

	return null;
}

async function readWithTimeout(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array> | null> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			reader.read(),
			new Promise<null>((resolve) => {
				timeout = setTimeout(() => resolve(null), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function parseConfigureResult(line: string): ConfigureResult | null {
	try {
		const data: unknown = JSON.parse(line);
		if (
			typeof data === "object" &&
			data !== null &&
			(data as Record<string, unknown>).type === "configureResult" &&
			typeof (data as Record<string, unknown>).ok === "boolean" &&
			typeof (data as Record<string, unknown>).message === "string"
		) {
			const record = data as Record<string, unknown>;
			return {
				type: "configureResult",
				ok: record.ok as boolean,
				message: record.message as string,
			};
		}
	} catch {
		return null;
	}

	return null;
}

function formatAge(ageMs: number | null): string {
	if (ageMs === null) return "-";
	if (ageMs < 1000) return `${ageMs}ms`;
	return `${Math.round(ageMs / 1000)}s`;
}

function formatNullableNumber(value: number | null, unit: string): string {
	return value === null ? "-" : `${value}${unit}`;
}

onMount(() => {
	void refreshRuntimeSettings();
	void refreshStatus();
	const interval = window.setInterval(() => {
		currentTime = Date.now();
		void refreshStatus();
	}, STATUS_POLL_INTERVAL_MS);

	return () => window.clearInterval(interval);
});

onDestroy(() => {
	clearCalibrationTimer();
	ws.disconnect();
});
</script>

<svelte:head>
	<title>M5 Controller</title>
</svelte:head>

<div class="m5-page">
	<PageHeader icon={RadioTower} label="M5 Controller" status={ws.status}>
		{#snippet actions()}
			<button class="header-settings-btn" onclick={resetDefaults} aria-label="Reset M5 settings">
				<RotateCcw size={16} />
			</button>
		{/snippet}
	</PageHeader>

	<main class="m5-main">
		<section class="m5-status surface-panel">
			<div class="status-item">
				<RadioTower size={16} />
				<span>{deviceEndpoint}</span>
			</div>
			<div class="status-item">
				<Activity size={16} />
				<span>{lastSentAt ? `Updated ${new Date(lastSentAt).toLocaleTimeString()}` : "Ready"}</span>
			</div>
			<div class="status-item">
				<Signal size={16} />
				<span>
					Bridge {bridgeStatus?.bridgeListening ? "listening" : "not listening"} · Device
					{bridgeStatus?.connected ? "connected" : "offline"}
				</span>
			</div>
			<div class="status-item">
				<Battery size={16} />
				<span>
					{formatNullableNumber(bridgeStatus?.batteryVoltage ?? null, "V")} ·
					{formatNullableNumber(bridgeStatus?.rssi ?? null, "dBm")}
				</span>
			</div>
		</section>

		<section
			class="calibration-stage surface-panel"
			class:is-active={calibrationStatus === "running"}
			class:is-complete={calibrationStatus === "complete"}
			class:is-error={calibrationStatus === "error"}
		>
			<div class="calibration-header">
				<div class="panel-heading">
					<Target size={16} />
					<h2>ICAROS Calibration</h2>
				</div>
				<div class="calibration-actions">
					{#if calibrationStatus === "running"}
						<button class="btn btn-secondary" onclick={cancelCalibration}>Cancel</button>
					{:else}
						<button class="btn btn-secondary" onclick={useRawM5Readout}>
							<RadioTower size={16} />
							<span>Use raw M5 readout</span>
						</button>
						<button class="btn btn-primary" onclick={startCalibration}>
							<Target size={16} />
							<span>Start calibration</span>
						</button>
					{/if}
				</div>
			</div>

			{#if calibrationStatus === "running"}
				<div class="calibration-current">
					<span class="calibration-step-count">
						Step {calibrationStepIndex + 1} / {calibrationSteps.length}
					</span>
					<h3>{currentCalibrationStep.label}</h3>
					<p>{currentCalibrationStep.detail}</p>
					<strong>{Math.ceil(calibrationRemainingMs / 1000)}s</strong>
					<div class="calibration-progress">
						<span style:width={`${calibrationProgress * 100}%`}></span>
					</div>
				</div>
			{:else if calibrationStatus === "complete" && calibrationValues}
				<div class="calibration-result">
					<CheckCircle size={24} />
					<div>
						<strong>{calibrationMessage}</strong>
						<span>
							Pitch axis {calibrationValues.pitchAxis} · Roll axis {calibrationValues.rollAxis}
						</span>
						<span>
							N {calibrationValues.neutralPitch.toFixed(1)}/{calibrationValues.neutralRoll.toFixed(1)}
							· U {calibrationValues.upPitch.toFixed(1)} · D {calibrationValues.downPitch.toFixed(1)}
							· R {calibrationValues.rightRoll.toFixed(1)} · L {calibrationValues.leftRoll.toFixed(1)}
						</span>
					</div>
				</div>
			{:else}
				<div class="calibration-idle">
					<span>{calibrationMessage}</span>
					<span>Mount the M5Stick on the ICAROS device and connect it wirelessly before starting.</span>
				</div>
			{/if}
		</section>

		<section class="m5-grid">
			<div class="m5-panel surface-panel">
				<div class="panel-heading">
					<RadioTower size={16} />
					<h2>Mounting</h2>
				</div>

				<M5MountingPreview
					pitchUsesRoll={settings.mountingPitchUsesRoll}
					rollUsesPitch={settings.mountingRollUsesPitch}
					invertPitch={settings.invertPitch}
					invertRoll={settings.invertRoll}
				/>

				<div class="switch-list">
					{#each mountingControls as control (control.key)}
						<div class="setting-row switch-row">
							<span class="setting-label">{control.label}</span>
							<Switch.Root
								checked={settings[control.key]}
								onCheckedChange={(value: boolean) => setBoolean(control.key, value)}
								class="switch-root"
							>
								<Switch.Thumb class="switch-thumb" />
							</Switch.Root>
						</div>
					{/each}
				</div>

				<div class="switch-list">
					{#each axisControls as control (control.key)}
						<div class="setting-row switch-row">
							<span class="setting-label">{control.label}</span>
							<Switch.Root
								checked={settings[control.key]}
								onCheckedChange={(value: boolean) => setBoolean(control.key, value)}
								class="switch-root"
							>
								<Switch.Thumb class="switch-thumb" />
							</Switch.Root>
						</div>
					{/each}
				</div>
			</div>

			<div class="m5-panel surface-panel">
				<div class="panel-heading">
					<SlidersHorizontal size={16} />
					<h2>Motion</h2>
				</div>

				{#each motionControls as control (control.key)}
					<label class="setting-row">
						<span class="setting-label">
							{control.label}
							<span class="setting-value">
								{formatValue(settings[control.key], control.step, control.unit)}
							</span>
						</span>
						<Slider.Root
							type="single"
							min={control.min}
							max={control.max}
							step={control.step}
							value={settings[control.key]}
							onValueChange={(value: number) => setNumber(control.key, value)}
							class="slider-root"
						>
							<span class="slider-track">
								<Slider.Range class="slider-range" />
							</span>
							<Slider.Thumb class="slider-thumb" index={0} />
						</Slider.Root>
					</label>
				{/each}
			</div>

			<div class="m5-panel surface-panel">
				<div class="panel-heading">
					<Activity size={16} />
					<h2>Signal</h2>
				</div>

				{#each safetyControls as control (control.key)}
					<label class="setting-row">
						<span class="setting-label">
							{control.label}
							<span class="setting-value">
								{formatValue(settings[control.key], control.step, control.unit)}
							</span>
						</span>
						<Slider.Root
							type="single"
							min={control.min}
							max={control.max}
							step={control.step}
							value={settings[control.key]}
							onValueChange={(value: number) => setNumber(control.key, value)}
							class="slider-root"
						>
							<span class="slider-track">
								<Slider.Range class="slider-range" />
							</span>
							<Slider.Thumb class="slider-thumb" index={0} />
						</Slider.Root>
					</label>
				{/each}
			</div>

			<div class="m5-panel surface-panel">
				<div class="panel-heading">
					<Wifi size={16} />
					<h2>WiFi Setup</h2>
				</div>

				<label class="form-row">
					<span class="setting-label">SSID</span>
					<input class="m5-input" type="text" bind:value={ssid} autocomplete="off" />
				</label>

				<label class="form-row">
					<span class="setting-label">Password</span>
					<div class="input-with-icon">
						<KeyRound size={14} />
						<input
							class="m5-input"
							type="password"
							bind:value={password}
							autocomplete="current-password"
						/>
					</div>
				</label>

				<label class="form-row">
					<span class="setting-label">Server URL</span>
					<input class="m5-input" type="text" bind:value={serverUrl} />
				</label>

				<label class="form-row">
					<span class="setting-label">Device ID</span>
					<input class="m5-input" type="text" bind:value={deviceId} autocomplete="off" />
				</label>

				{#if isLocalHost}
					<div class="diagnostic-message is-warning">
						<AlertTriangle size={14} />
						<span>Use the Mac LAN IP in Server URL, not localhost.</span>
					</div>
				{/if}

				<button class="btn btn-primary wifi-save" onclick={configureWifi} disabled={!canConfigure}>
					{#if configureStatus === "busy"}
						<Usb size={16} />
					{:else}
						<Save size={16} />
					{/if}
					<span>{configureStatus === "busy" ? "Configuring" : "Save to M5 over USB"}</span>
				</button>

				<div
					class="diagnostic-message"
					class:is-success={configureStatus === "success"}
					class:is-error={configureStatus === "error"}
				>
					<Usb size={14} />
					<span>{configureMessage}</span>
				</div>
			</div>

			<div class="m5-panel surface-panel status-panel">
				<div class="panel-heading">
					<Activity size={16} />
					<h2>Status</h2>
				</div>

				<div class="status-pills">
					<span class="status-pill" class:is-live={bridgeStatus?.bridgeListening}>Bridge</span>
					<span class="status-pill" class:is-live={bridgeStatus?.connected}>Device</span>
					<span class="status-pill" class:is-live={bridgeStatus?.streaming}>Streaming</span>
					<span class="status-pill" class:is-live={bridgeStatus?.calibrated}>Calibrated</span>
				</div>

				<dl class="status-list">
					<div>
						<dt>Device</dt>
						<dd>{bridgeStatus?.deviceId ?? "-"}</dd>
					</div>
					<div>
						<dt>Firmware</dt>
						<dd>{bridgeStatus?.firmwareVersion ?? "-"}</dd>
					</div>
					<div>
						<dt>Last message</dt>
						<dd>{formatAge(lastMessageAgeMs)}</dd>
					</div>
					<div>
						<dt>Heartbeat</dt>
						<dd>{formatAge(lastHeartbeatAgeMs)}</dd>
					</div>
					<div>
						<dt>RSSI</dt>
						<dd>{formatNullableNumber(bridgeStatus?.rssi ?? null, "dBm")}</dd>
					</div>
					<div>
						<dt>Battery</dt>
						<dd>{formatNullableNumber(bridgeStatus?.batteryVoltage ?? null, "V")}</dd>
					</div>
					<div>
						<dt>Heap</dt>
						<dd>{formatNullableNumber(bridgeStatus?.freeHeap ?? null, "B")}</dd>
					</div>
					<div>
						<dt>Uptime</dt>
						<dd>{formatAge(bridgeStatus?.uptimeMs ?? null)}</dd>
					</div>
				</dl>

				{#if bridgeStatus?.orientation}
					<div class="orientation-strip">
						<span>P {bridgeStatus.orientation.pitch.toFixed(1)}</span>
						<span>R {bridgeStatus.orientation.roll.toFixed(1)}</span>
						<span>Y {bridgeStatus.orientation.yaw.toFixed(1)}</span>
						<span>Q {bridgeStatus.orientation.quality.toFixed(2)}</span>
					</div>
				{/if}

				{#if statusError || bridgeStatus?.lastError}
					<div class="diagnostic-message is-error">
						<AlertTriangle size={14} />
						<span>{statusError ?? bridgeStatus?.lastError}</span>
					</div>
				{:else if bridgeStatus?.lastEvent}
					<div class="diagnostic-message">
						<Activity size={14} />
						<span>{bridgeStatus.lastEvent}</span>
					</div>
				{/if}
			</div>
		</section>
	</main>
</div>

<style>
.m5-page {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
}

.m5-main {
	flex: 1;
	width: min(960px, 100%);
	margin: 0 auto;
	padding: 1.5rem 1rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.m5-status {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
	padding: 1rem;
}

.status-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	color: var(--text-muted);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.status-item span {
	overflow-wrap: anywhere;
}

.calibration-stage {
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
	min-height: 168px;
	border-color: var(--border);
}

.calibration-stage.is-active {
	min-height: 360px;
	justify-content: space-between;
	border-color: var(--accent-muted);
}

.calibration-stage.is-complete {
	border-color: var(--success);
}

.calibration-stage.is-error {
	border-color: var(--error);
}

.calibration-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.calibration-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.calibration-current {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1rem;
	text-align: center;
}

.calibration-step-count {
	color: var(--accent-muted);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	text-transform: uppercase;
}

.calibration-current h3 {
	margin: 0;
	font-size: clamp(2rem, 8vw, 4.5rem);
	line-height: 1;
	text-transform: uppercase;
}

.calibration-current p {
	max-width: 620px;
	margin: 0;
	color: var(--text-muted);
	font-size: 1rem;
}

.calibration-current strong {
	font-family: var(--font-mono);
	font-size: 2rem;
	color: var(--accent-muted);
}

.calibration-progress {
	width: min(520px, 100%);
	height: 8px;
	background: var(--border);
	overflow: hidden;
}

.calibration-progress span {
	display: block;
	height: 100%;
	background: var(--accent-muted);
}

.calibration-result,
.calibration-idle {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	color: var(--text-muted);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.calibration-result {
	color: var(--success);
}

.calibration-result div,
.calibration-idle {
	min-width: 0;
}

.calibration-result div,
.calibration-idle {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.m5-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
	gap: 1rem;
	align-items: start;
}

.m5-panel {
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 1.15rem;
}

.panel-heading {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	color: var(--text);
}

.panel-heading h2 {
	margin: 0;
	font-size: 0.82rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.switch-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
}

.switch-row {
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.form-row {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

.m5-input {
	width: 100%;
	min-height: 38px;
	border: 1px solid var(--border);
	background: var(--surface);
	color: var(--text);
	padding: 0.55rem 0.65rem;
	font: inherit;
	font-family: var(--font-mono);
	font-size: 0.82rem;
}

.m5-input:focus {
	outline: 1px solid var(--accent-muted);
	outline-offset: 1px;
}

.input-with-icon {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 0.5rem;
	color: var(--text-muted);
}

.wifi-save {
	width: 100%;
	justify-content: center;
	gap: 0.5rem;
}

.wifi-save:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.status-panel {
	grid-column: 1 / -1;
}

.status-pills {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.5rem;
}

.status-pill {
	border: 1px solid var(--border);
	color: var(--text-muted);
	padding: 0.5rem;
	text-align: center;
	font-family: var(--font-mono);
	font-size: 0.68rem;
	text-transform: uppercase;
}

.status-pill.is-live {
	border-color: var(--success);
	color: var(--success);
}

.status-list {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.75rem;
	margin: 0;
}

.status-list div {
	min-width: 0;
}

.status-list dt {
	color: var(--text-muted);
	font-family: var(--font-mono);
	font-size: 0.66rem;
	text-transform: uppercase;
}

.status-list dd {
	margin: 0.2rem 0 0;
	color: var(--text);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.orientation-strip {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.5rem;
	font-family: var(--font-mono);
	font-size: 0.78rem;
	color: var(--accent-muted);
}

.orientation-strip span {
	border: 1px solid var(--border);
	padding: 0.45rem;
	text-align: center;
}

.diagnostic-message {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
	color: var(--text-muted);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	line-height: 1.35;
}

.diagnostic-message.is-success {
	color: var(--success);
}

.diagnostic-message.is-warning {
	color: var(--warning);
}

.diagnostic-message.is-error {
	color: var(--error);
}

@media (max-width: 720px) {
	.calibration-header,
	.calibration-result {
		align-items: flex-start;
		flex-direction: column;
	}

	.m5-status,
	.m5-grid,
	.switch-list,
	.status-pills,
	.status-list,
	.orientation-strip {
		grid-template-columns: 1fr;
	}
}
</style>
