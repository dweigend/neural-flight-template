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
  if (state.isDisposed) return;

  state.player.updateOrientation({
    type: "orientation",
    pitch: orientation.pitch,
    roll: orientation.roll,
    timestamp: 0,
  });

  state.player.updateSpeed({
    type: "speed",
    action: "accelerate",
    active: speed.accelerate,
    timestamp: 0,
  });
  state.player.updateSpeed({
    type: "speed",
    action: "brake",
    active: speed.brake,
    timestamp: 0,
  });
}
