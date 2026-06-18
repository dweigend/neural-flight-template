import type * as THREE from "three";
import type { ExperienceState } from "../types";
import type { BerlinFlightState } from "./types";

export function applySettings(
	id: string,
	value: number | boolean | string,
	state: ExperienceState,
	_scene: THREE.Scene,
): void {
	const s = state as BerlinFlightState;
	if (s.isDisposed) return;

	switch (id) {
		case "baseSpeed":
			s.settings.baseSpeed = value as number;
			s.player.baseSpeed = s.settings.baseSpeed;
			return;

		case "showPlaceholder":
			s.settings.showPlaceholder = value as boolean;
			s.placeholder.group.visible = s.settings.showPlaceholder;
			return;

		default:
			return;
	}
}
