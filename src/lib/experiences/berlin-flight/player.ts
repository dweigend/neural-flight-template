import type { ExperienceState } from "../types";
import type { BerlinFlightState } from "./types";

export function updatePlayer(
	orientation: { pitch: number; roll: number },
	speed: { accelerate: boolean; brake: boolean },
	state: ExperienceState,
	_delta: number,
): void {
	const s = state as BerlinFlightState;
	if (s.isDisposed) return;

	s.player.updateOrientation({
		type: "orientation",
		pitch: orientation.pitch,
		roll: orientation.roll,
		timestamp: 0,
	});

	if (speed.accelerate) {
		s.player.updateSpeed({
			type: "speed",
			action: "accelerate",
			active: true,
			timestamp: 0,
		});
		s.player.updateSpeed({
			type: "speed",
			action: "brake",
			active: false,
			timestamp: 0,
		});
		return;
	}

	if (speed.brake) {
		s.player.updateSpeed({
			type: "speed",
			action: "accelerate",
			active: false,
			timestamp: 0,
		});
		s.player.updateSpeed({
			type: "speed",
			action: "brake",
			active: true,
			timestamp: 0,
		});
		return;
	}

	s.player.updateSpeed({
		type: "speed",
		action: "accelerate",
		active: false,
		timestamp: 0,
	});
	s.player.updateSpeed({
		type: "speed",
		action: "brake",
		active: false,
		timestamp: 0,
	});
}
