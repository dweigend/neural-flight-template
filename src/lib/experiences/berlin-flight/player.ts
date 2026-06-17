import type { BerlinState } from "./types";

/**
 * Updates player physics and movement for Berlin
 */
export function updatePlayer(
	_orientation: { pitch: number; roll: number },
	speed: { accelerate: boolean; brake: boolean },
	state: BerlinState,
	delta: number,
): void {
	// Simple acceleration/braking logic
	const accel = speed.accelerate ? 2.0 : speed.brake ? -4.0 : -0.5;
	state.speed = Math.max(0, state.speed + accel * delta);

	// We don't update position here directly,
	// the platform handles camera movement based on orientation.
	// We just manage experience-specific player state.
}
