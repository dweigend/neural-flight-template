import * as THREE from "three";
import type { ExperienceState } from "../types";
import { applyPhase, type B5LesserState } from "./scene";

export function applySettings(
	id: string,
	value: number | boolean | string,
	state: ExperienceState,
	scene: THREE.Scene,
): void {
	const s = state as B5LesserState;

	switch (id) {
		case "tunnelSpeed":
			s.tunnelSpeed = value as number;
			break;

		case "phaseDuration":
			s.phaseDuration = value as number;
			break;

		case "bendSpeed":
			s.bendSpeed = value as number;
			break;

		case "baseSpeed":
			s.baseSpeed = value as number;
			break;

		case "forcePhase": {
			const p = Math.round(value as number);
			if (p >= 0 && p <= 5) applyPhase(s, p);
			break;
		}

		default:
			break;
	}

	void scene;
}
