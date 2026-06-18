import * as THREE from "three";
import type { BerlinTilesLoadState } from "../types";

const STATUS_COLORS = {
	idle: "#94a3b8",
	loading: "#facc15",
	ready: "#22c55e",
	error: "#ef4444",
	disposed: "#64748b",
} as const;

export interface BerlinStatusIndicator {
	group: THREE.Group;
	sprite: THREE.Sprite;
	texture: THREE.CanvasTexture;
	material: THREE.SpriteMaterial;
	lastLabel: string;
}

export function createStatusIndicator(): BerlinStatusIndicator {
	const texture = new THREE.CanvasTexture(document.createElement("canvas"));
	texture.needsUpdate = true;

	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	});
	const sprite = new THREE.Sprite(material);
	sprite.position.set(0, -0.4, -2.5);
	sprite.scale.set(1.8, 0.45, 1);

	const group = new THREE.Group();
	group.name = "berlin-status-indicator";
	group.renderOrder = 1000;
	group.add(sprite);

	const indicator: BerlinStatusIndicator = {
		group,
		sprite,
		texture,
		material,
		lastLabel: "",
	};

	updateStatusIndicator(indicator, {
		status: "idle",
		isReady: false,
		errorMessage: null,
	});
	return indicator;
}

export function updateStatusIndicator(
	indicator: BerlinStatusIndicator,
	state: BerlinTilesLoadState,
): void {
	const label = createStatusLabel(state);
	if (indicator.lastLabel === label) return;

	indicator.lastLabel = label;
	renderLabelToTexture(indicator.texture, label, STATUS_COLORS[state.status]);
	indicator.group.visible = state.status !== "ready";
}

export function disposeStatusIndicator(indicator: BerlinStatusIndicator): void {
	indicator.group.removeFromParent();
	indicator.material.dispose();
	indicator.texture.dispose();
}

function createStatusLabel(state: BerlinTilesLoadState): string {
	if (state.status === "error") {
		return state.errorMessage ? `Tiles error: ${state.errorMessage}` : "Tiles error";
	}
	if (state.status === "loading") return "Tiles loading…";
	if (state.status === "ready") return "Tiles ready";
	if (state.status === "disposed") return "Tiles disposed";
	return "Tiles idle";
}

function renderLabelToTexture(
	texture: THREE.CanvasTexture,
	label: string,
	accentColor: string,
): void {
	const canvas = texture.image;
	if (!(canvas instanceof HTMLCanvasElement)) return;

	canvas.width = 1024;
	canvas.height = 256;

	const context = canvas.getContext("2d");
	if (!context) return;

	context.clearRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "rgba(15, 23, 42, 0.88)";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.strokeStyle = accentColor;
	context.lineWidth = 10;
	context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
	context.fillStyle = "#e2e8f0";
	context.font = "bold 52px sans-serif";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 80);
	texture.needsUpdate = true;
}
