import type { BerlinState } from "../types";
import { createBerlinDebugOverlay } from "./overlay";

export function setBerlinDebugEnabled(
  state: BerlinState,
  enabled: boolean,
): void {
  if (state.isDisposed) return;
  const changed = state.debugEnabled !== enabled;

  state.debugEnabled = enabled;
  state.coneRuntime.setDebugEnabled(enabled);
  if (!changed) return;

  if (!enabled) {
    state.debugOverlay?.dispose();
    state.debugOverlay = null;
    return;
  }

  state.debugOverlay = createBerlinDebugOverlay(state.camera);
}
