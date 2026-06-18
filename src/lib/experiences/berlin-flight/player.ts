import type { PlayerOrientationInput } from "../types";
import type { BerlinState } from "./types";

/**
 * Updates player physics and movement for Berlin
 */
export function updatePlayer(
  orientation: PlayerOrientationInput,
  speed: { accelerate: boolean; brake: boolean },
  state: BerlinState,
  _delta: number,
): void {
  const timestamp = Date.now();

  state.latestOrientation = orientation;

  // Pass speed commands to the FlightPlayer instance
  state.player.updateSpeed({
    type: "speed",
    action: "accelerate",
    active: speed.accelerate,
    timestamp,
  });
  state.player.updateSpeed({
    type: "speed",
    action: "brake",
    active: speed.brake,
    timestamp,
  });
}
