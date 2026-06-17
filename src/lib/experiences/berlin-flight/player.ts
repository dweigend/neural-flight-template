import type { BerlinState } from "./types";

/**
 * Updates player physics and movement for Berlin
 */
export function updatePlayer(
  orientation: { pitch: number; roll: number },
  speed: { accelerate: boolean; brake: boolean },
  state: BerlinState,
  _delta: number,
): void {
  const timestamp = Date.now();

  // Pass orientation to the FlightPlayer instance
  state.player.updateOrientation({
    type: "orientation",
    pitch: orientation.pitch,
    roll: orientation.roll,
    timestamp,
  });

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
