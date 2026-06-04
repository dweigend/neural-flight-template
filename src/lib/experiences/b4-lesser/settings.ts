import * as THREE from "three";
import type { ExperienceState } from "../types";
import type { B4LesserState } from "./scene";

export function applySettings(
	id: string,
	value: number | boolean | string,
	state: ExperienceState,
	scene: THREE.Scene,
): void {
	const s = state as B4LesserState;

	switch (id) {
		// ── Pacing ──────────────────────────────────────────────────
		case "tunnelSpeed":
			s.tunnelSpeed = value as number;
			break;

		case "phaseDuration":
			s.phaseDuration = value as number;
			break;

		// ── Phase 2 ─────────────────────────────────────────────────
		case "bendSpeed":
			s.bendSpeed = value as number;
			break;

		// ── Flight ──────────────────────────────────────────────────
		case "baseSpeed":
			s.baseSpeed = value as number;
			break;

		// ── Debug: force jump to phase ───────────────────────────────
		case "forcePhase": {
			const p = Math.round(value as number);
			if (p >= 0 && p <= 2) {
				s.phase = p;
				s.phaseT = 0;
			}
			break;
		}

		default:
			break;
	}

	// Suppress unused scene warning
	void scene;
}
