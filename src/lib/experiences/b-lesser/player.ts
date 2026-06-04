import type { ExperienceState } from "../types";
import type { BLesserState } from "./scene";

/**
 * Stores the latest ICAROS orientation + speed into state.
 * Actual phase-dependent movement is handled in tick() since it
 * depends on elapsed time and phase — both available there.
 */
export function updatePlayer(
	orientation: { pitch: number; roll: number },
	speed: { accelerate: boolean; brake: boolean },
	state: ExperienceState,
	_delta: number,
): void {
	const s = state as BLesserState;
	s.orientation = { pitch: orientation.pitch, roll: orientation.roll };
	s.speed = { accelerate: speed.accelerate, brake: speed.brake };
}
