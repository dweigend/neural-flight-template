import type * as THREE from "three";
import type { FlightPlayer } from "$lib/three/player";
import type { ExperienceState } from "../types";
import {
	BERLIN_DEFAULT_SETTINGS,
	BERLIN_TILE_RUNTIME,
} from "./constants";

export type BerlinTileRuntimeChoice = typeof BERLIN_TILE_RUNTIME.id;

export interface BerlinExperienceSettings {
	baseSpeed: number;
	showPlaceholder: boolean;
}

export interface BerlinPlaceholderResources {
	group: THREE.Group;
	geometry: THREE.BufferGeometry;
	material: THREE.LineBasicMaterial;
}

export interface BerlinFlightState extends ExperienceState {
	camera: THREE.PerspectiveCamera;
	player: FlightPlayer;
	root: THREE.Group;
	placeholder: BerlinPlaceholderResources;
	settings: BerlinExperienceSettings;
	runtimeChoice: BerlinTileRuntimeChoice;
	isDisposed: boolean;
}

export function createDefaultBerlinSettings(): BerlinExperienceSettings {
	return {
		baseSpeed: BERLIN_DEFAULT_SETTINGS.baseSpeed,
		showPlaceholder: BERLIN_DEFAULT_SETTINGS.showPlaceholder,
	};
}
