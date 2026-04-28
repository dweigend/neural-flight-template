import type { ExperienceState } from "../types";

export function updatePlayer(
	_orientation: { pitch: number; roll: number },
	_speed: { accelerate: boolean; brake: boolean },
	_state: ExperienceState,
	_delta: number,
): void {
	// Keyboard orbit camera lives in scene.ts for this browser prototype.
}
