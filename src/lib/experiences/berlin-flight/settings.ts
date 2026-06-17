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
      state.player.baseSpeed = value as number;
      break;
    default:
      break;
  }
}
