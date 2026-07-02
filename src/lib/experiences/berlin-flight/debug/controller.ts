import type { BerlinState } from "../types";
import { createBerlinDebugOverlay } from "./overlay";

export function setBerlinDebugEnabled(
  state: BerlinState,
  enabled: boolean,
): void {
  if (state.isDisposed) return;
  if (state.debugEnabled === enabled) return;

  state.debugEnabled = enabled;
  state.coneRuntime.root.visible = enabled;

  if (!enabled) {
    state.debugOverlay?.dispose();
    state.debugOverlay = null;
    return;
  }

  state.debugOverlay = createBerlinDebugOverlay(state.camera);
}
