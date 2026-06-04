import type { ExperienceState } from "../types";
import type { B5LesserState } from "./scene";

export function updatePlayer(
	orientation: { pitch: number; roll: number },
	speed: { accelerate: boolean; brake: boolean },
	state: ExperienceState,
	_delta: number,
): void {
	const s = state as B5LesserState;
	s.orientation = { pitch: orientation.pitch, roll: orientation.roll };
	s.speed = { accelerate: speed.accelerate, brake: speed.brake };
}
