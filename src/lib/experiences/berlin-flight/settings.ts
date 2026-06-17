import type { Scene } from "three";
import type { BerlinState } from "./types";

/**
 * Applies parameter changes to the Berlin experience
 */
export function applySettings(
  id: string,
  value: number | boolean | string,
  state: BerlinState,
  _scene: Scene,
): void {
  switch (id) {
    case "moveSpeed":
      if (typeof value !== "number") return;
      state.player.baseSpeed = value;
      break;
    case "debugOverlay": {
      if (typeof value !== "boolean") return;
      if (state.debugEnabled === value) return;

      state.debugEnabled = value;
      state.debugOverlay?.setEnabled(value);
      break;
    }
    default:
      break;
  }
}
