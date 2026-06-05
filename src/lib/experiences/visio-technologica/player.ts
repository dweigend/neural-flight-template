import type { ExperienceState } from "../types";
import type { VisioTechnologicaState } from "./scene";

export function updatePlayer(
  orientation: { pitch: number; roll: number },
  _speed: { accelerate: boolean; brake: boolean },
  state: ExperienceState,
  _delta: number,
): void {
  const s = state as VisioTechnologicaState;
  const hasExternalOrientation =
    Number.isFinite(orientation.pitch) && Number.isFinite(orientation.roll);

  s.keyboardControlsActive = !hasExternalOrientation;
  if (!hasExternalOrientation) {
    s.steeringPitch = 0;
    s.steeringRoll = 0;
    return;
  }

  s.steeringPitch = Math.max(-1, Math.min(1, orientation.pitch));
  s.steeringRoll = Math.max(-1, Math.min(1, orientation.roll));
}
