import * as THREE from "three";
import { FlightPlayer } from "$lib/three/player";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import {
	BERLIN_CAMERA,
	BERLIN_DEFAULT_SETTINGS,
	BERLIN_SPAWN,
	BERLIN_TILE_RUNTIME,
} from "./constants";
import {
	createDefaultBerlinSettings,
	type BerlinFlightState,
	type BerlinPlaceholderResources,
} from "./types";

function createPlaceholderMarker(): BerlinPlaceholderResources {
	const points = new Float32Array([
		-4, 0, 0,
		4, 0, 0,
		0, -4, 0,
		0, 4, 0,
		0, 0, -4,
		0, 0, 4,
	]);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));

	const material = new THREE.LineBasicMaterial({ color: "#7dd3fc" });
	const lines = new THREE.LineSegments(geometry, material);
	lines.name = "berlin-placeholder-marker";

	const group = new THREE.Group();
	group.name = "berlin-placeholder-root";
	group.visible = BERLIN_DEFAULT_SETTINGS.showPlaceholder;
	group.add(lines);

	return { group, geometry, material };
}

function disposePlaceholder(placeholder: BerlinPlaceholderResources): void {
	placeholder.group.removeFromParent();
	placeholder.geometry.dispose();
	placeholder.material.dispose();
}

export async function setup(ctx: SetupContext): Promise<BerlinFlightState> {
	const player = new FlightPlayer({
		fov: BERLIN_CAMERA.fov,
		near: BERLIN_CAMERA.near,
		far: BERLIN_CAMERA.far,
		spawnPosition: BERLIN_SPAWN.position,
		baseSpeed: BERLIN_DEFAULT_SETTINGS.baseSpeed,
	});
	ctx.scene.add(player.rig);

	const root = new THREE.Group();
	root.name = "berlin-flight-root";
	ctx.scene.add(root);

	const placeholder = createPlaceholderMarker();
	root.add(placeholder.group);

	const settings = createDefaultBerlinSettings();
	player.baseSpeed = settings.baseSpeed;

	return {
		camera: player.camera,
		player,
		root,
		placeholder,
		settings,
		runtimeChoice: BERLIN_TILE_RUNTIME.id,
		isDisposed: false,
	};
}

export function tick(
	state: ExperienceState,
	ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
	const s = state as BerlinFlightState;
	if (s.isDisposed) return { state: s };

	s.player.tick(ctx.delta);
	if (!s.placeholder.group.visible) return { state: s };

	s.placeholder.group.rotation.y += ctx.delta * 0.35;
	return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
	const s = state as BerlinFlightState;
	if (s.isDisposed) return;

	s.isDisposed = true;
	disposePlaceholder(s.placeholder);
	s.root.removeFromParent();
	s.player.rig.removeFromParent();
	s.camera.clear();

	scene.remove(s.root);
	scene.remove(s.player.rig);
}
