import type { BerlinState } from "../types";
import { BERLIN_MITTE_ORIGIN, getECEFToLocalMatrix } from "../geo";
import { resolveBerlinTileset, isSourceConfigured } from "./tiles-source";
import { TilesRuntimeAdapter } from "./tiles-runtime";

export async function loadTilesWhenConfigured(
  state: BerlinState,
): Promise<void> {
  if (!isSourceConfigured()) {
    state.isLoading = false;
    return;
  }

  try {
    const { url, token } = await resolveBerlinTileset();
    if (state.isDisposed || state.abortController.signal.aborted) return;

    console.log("[BerlinFlight] Resolved tileset URL:", url);
    console.log("[BerlinFlight] Token length:", token?.length ?? 0);

    const runtime = new TilesRuntimeAdapter(url, token);
    state.tilesRuntime = runtime;

    const tiles = await runtime.loadTiles(
      state.tilesGroup,
      state.abortController.signal,
    );
    if (state.isDisposed || state.abortController.signal.aborted) {
      runtime.dispose();
      return;
    }

    const ltsMatrix = getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(ltsMatrix);
    tiles.group.updateMatrixWorld(true);

    console.log("[BerlinFlight] Tileset loaded and positioned.");
    state.isLoading = false;
  } catch (error) {
    if (state.isDisposed || state.abortController.signal.aborted) return;

    console.error("[BerlinFlight] Failed to load tileset:", error);
    state.isLoading = false;
  }
}
