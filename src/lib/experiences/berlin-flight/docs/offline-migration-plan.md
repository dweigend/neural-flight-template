# Berlin Flight Offline Tiles Migration Plan

## Purpose

Move `berlin-flight` from authenticated Cesium-hosted streaming to a headset-compatible offline setup that uses downloaded tiles served from a machine on the same local LAN.

This plan is tailored to the current code in:

- `src/lib/experiences/berlin-flight/runtime/tiles-source.ts`
- `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- `src/lib/experiences/berlin-flight/scene.ts`
- `src/lib/experiences/berlin-flight/constants.ts`

## Recommended End State

Use this final architecture:

1. Berlin tiles are stored on disk on a local machine, not in browser memory.
2. The same local machine serves the app and the tiles over HTTPS on the LAN.
3. The Quest loads `/vr` and fetches `/tiles/berlin/...` from that local machine.
4. `berlin-flight` keeps using `3d-tiles-renderer`.
5. Cesium token resolution becomes optional and is disabled in offline mode.

This is the fastest robust path because:

- it stays close to the current runtime structure
- it avoids depending on browser cache or IndexedDB persistence
- it works with WebXR browser constraints
- it keeps the existing `TilesRuntimeAdapter`

## Important Constraint

Do not assume that "Cesium tiles are open source and free to download."

What is open is the **3D Tiles format**. That is separate from the **data license** and the **download/export rights** for a specific asset.

Relevant Cesium docs:

- 3D Tiles is an open standard: https://cesium.com/why-cesium/3d-tiles/
- Cesium ion content usage: https://cesium.com/learn/ion/content-usage-and-attribution-guide/
- Cesium ion archives/exports: https://cesium.com/learn/ion/cesium-ion-archives-and-exports/

Two concrete implications from Cesium's documentation:

- downloaded archives/exports are available for data **you uploaded to Cesium ion**
- Asset Depot assets such as Cesium-hosted global content may **not** be downloadable/exportable in the same way

So the first hard gate is: identify exactly which Berlin asset you are using today and whether you are allowed to download it for offline use.

## Current State Summary

Today `berlin-flight` does this:

1. `scene.ts` calls `resolveBerlinTileset()`
2. `tiles-source.ts` either:
   - uses `PUBLIC_BERLIN_TILES_URL`, or
   - calls the Cesium ion asset endpoint using `PUBLIC_CESIUM_ION_TOKEN` + `PUBLIC_BERLIN_ION_ASSET_ID`
3. `TilesRuntimeAdapter` creates a `TilesRenderer`
4. auth headers or Google auth plugin are attached if needed
5. the tileset is positioned with `getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN)`

That means the offline migration should focus on replacing the source and delivery path, not the whole rendering stack.

## Delivery Strategy

Use a local static tiles directory served over HTTPS.

Recommended target path shape:

```text
static/tiles/berlin/
  tileset.json
  ...
```

Runtime URL in offline mode:

```text
/tiles/berlin/tileset.json
```

Avoid these for the first offline version:

- bundling the tiles into the JS build
- storing tiles only in browser memory
- relying on service worker caching as the primary source
- rewriting the renderer away from `3d-tiles-renderer`

## Migration Phases

### Phase 0 - Asset provenance and rights gate

Objective:
Determine whether the current Berlin tiles can legally and practically be downloaded for offline use.

Actions:

1. Identify the actual asset behind `PUBLIC_BERLIN_ION_ASSET_ID` or `PUBLIC_BERLIN_TILES_URL`.
2. Record whether it is:
   - your own uploaded asset
   - Cesium global content
   - Google Photorealistic 3D Tiles
   - another third-party source
3. Confirm whether archive/export/download is allowed.
4. If not allowed, choose a replacement Berlin dataset that is exportable and acceptable for Quest performance.

Checks:

- You can name the exact source asset and owner.
- You have a yes/no answer on offline download rights.
- If the answer is no, a replacement dataset has been chosen before code changes begin.

Coding-agent prompt:

```text
Audit the current berlin-flight tiles source and document the asset provenance and offline rights gate.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-source.ts`
- inspect `src/lib/experiences/berlin-flight/constants.ts`
- inspect environment variable usage for the Berlin asset
- create a short markdown note under `src/lib/experiences/berlin-flight/` named `offline-asset-audit.md`
- record the current source mechanism, the asset identifiers, and the decisions needed before offline download work can proceed
- do not implement download logic yet
- clearly separate facts from assumptions

Constraints for this task:
- do not use `any`
- keep edits within `src/lib/experiences/berlin-flight/` unless a small supporting note elsewhere is necessary
- use explicit TypeScript types if code changes are needed
- do not remove the current online path
- run `bunx biome check --write .` after edits if you touched code
```

### Phase 1 - Introduce explicit source modes

Objective:
Make tile sourcing an explicit runtime mode instead of implicit token/url branching.

Actions:

1. Add a source mode model such as:
   - `ion`
   - `direct-url`
   - `local-static`
2. Replace the current boolean-style source detection with a typed resolver result.
3. Keep the current online behavior unchanged under `ion` and `direct-url`.
4. Add a local-static mode that resolves to `/tiles/berlin/tileset.json` with no auth token.

Checks:

- `scene.ts` does not care whether the source is online or offline.
- auth behavior is attached only when the source mode needs it.
- local mode can be selected without editing code.

Coding-agent prompt:

```text
Refactor berlin-flight tile source resolution so that source selection is explicit and supports offline local-static tiles.

Task:
- update `src/lib/experiences/berlin-flight/runtime/tiles-source.ts`
- add any required types in `src/lib/experiences/berlin-flight/types.ts` or a small new local types file
- preserve the current Cesium ion and direct URL paths
- add a new source mode for local static tiles served from `/tiles/berlin/tileset.json`
- return a typed source descriptor instead of only `{ url, token }`
- keep `scene.ts` changes minimal and local to berlin-flight

Checks to satisfy:
- existing online behavior still works
- local-static mode returns no auth token and does not require Cesium credentials
- TypeScript stays strict

Constraints for this task:
- do not use `any`
- primarily edit files in `src/lib/experiences/berlin-flight/`
- keep files small and cohesive
- add cleanup only if you introduce owned resources
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 2 - Add an offline tiles directory contract

Objective:
Define where offline tiles live and fail clearly when they are missing.

Actions:

1. Create a repo-level directory contract for offline data, preferably:
   - `static/tiles/berlin/`
2. Add a small manifest/readme describing expected contents.
3. Add startup validation for local-static mode so missing `tileset.json` produces a clear error message.
4. Do not commit large tile payloads yet.

Checks:

- there is one canonical offline tile path
- missing local tiles fail loudly and clearly
- no ambiguous "it just keeps loading forever" state remains

Coding-agent prompt:

```text
Add the offline tile directory contract for berlin-flight and clear validation around it.

Task:
- create a small markdown or text note describing the expected offline tile directory layout
- wire berlin-flight local-static mode so it reports a clear error if `/tiles/berlin/tileset.json` is unavailable
- keep validation inside the existing berlin-flight runtime flow
- do not add the real tile payload yet

Checks to satisfy:
- local-static mode produces a clear log/error path on missing tiles
- online modes remain unchanged
- no new global architecture is introduced

Constraints for this task:
- do not use `any`
- keep edits narrowly scoped
- do not add unrelated dependencies
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 3 - Create a tiny offline smoke-test tileset path

Objective:
Prove that the current runtime can load a local tileset before solving the real Berlin download pipeline.

Actions:

1. Add a tiny local fixture tileset under `static/tiles/berlin-smoke/`.
2. Point local-static mode temporarily at the smoke fixture.
3. Verify the Quest/browser can fetch the local tiles through the same HTTPS host serving the app.
4. Confirm no Cesium endpoint is contacted in this mode.

Checks:

- the smoke tileset loads in `berlin-flight`
- network traffic shows only local LAN requests
- `api.cesium.com` and `tile.googleapis.com` are not contacted

Coding-agent prompt:

```text
Create an offline smoke test for berlin-flight using a tiny local 3D Tiles fixture.

Task:
- add a small local fixture tileset under `static/tiles/berlin-smoke/`
- make local-static mode configurable so it can point to the smoke fixture
- verify the runtime path in `scene.ts` and `tiles-runtime.ts` does not require Cesium auth for this mode
- keep the production Berlin path ready for later real data

Checks to satisfy:
- the smoke fixture loads from the local app host
- local-static mode does not call Cesium ion
- online modes still compile

Constraints for this task:
- do not use `any`
- do not add heavy new dependencies
- keep changes inside the berlin-flight experience and static fixture path
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 4 - Build the tile ingestion workflow

Objective:
Create a repeatable path from "exported/downloaded Berlin tiles" to the local static serving directory.

Actions:

1. Decide the ingestion source:
   - Cesium ion archive/export of your own asset, or
   - replacement Berlin dataset converted to 3D Tiles
2. Add a script or documented manual workflow that stages tiles into:
   - `static/tiles/berlin/`
3. Preserve relative paths exactly as required by `tileset.json`.
4. Add ignore rules if tile data should stay out of git.

Checks:

- a fresh machine can populate `static/tiles/berlin/` from documented steps
- `tileset.json` relative references resolve correctly
- the repo does not accidentally commit huge tile payloads unless explicitly intended

Coding-agent prompt:

```text
Implement the berlin-flight offline tile ingestion workflow for a local static tiles directory.

Task:
- add a documented and repeatable ingestion path for populating `static/tiles/berlin/`
- if a small helper script is useful, add it under `scripts/` and keep it simple
- preserve the exact file layout expected by `tileset.json`
- add or update `.gitignore` if large offline tile payloads should remain untracked
- do not hardcode Cesium-specific assumptions if the source may be replaced later

Checks to satisfy:
- a developer can follow the repo instructions and populate the offline tile directory
- the resulting local tileset is fetchable by the app without URL rewriting hacks
- the workflow is explicit about prerequisites and inputs

Constraints for this task:
- do not use `any`
- prefer a simple script or a precise doc over a complex pipeline
- stay compatible with Bun-based local development
- run `bunx biome check --write .` if you add code
```

### Phase 5 - Switch berlin-flight to real offline Berlin data

Objective:
Load the actual downloaded Berlin tiles through the local-static path.

Actions:

1. Point local-static mode at `/tiles/berlin/tileset.json`.
2. Verify the existing ECEF-to-local transform still positions the content correctly.
3. Adjust only if the downloaded dataset uses a different geospatial origin or transform.
4. Keep online fallback available until offline parity is confirmed.

Checks:

- Berlin loads from local files
- the city is aligned with the current `BERLIN_MITTE_ORIGIN`
- the scene is navigable on headset without internet

Coding-agent prompt:

```text
Wire berlin-flight local-static mode to the real offline Berlin tileset and preserve the existing scene behavior.

Task:
- point local-static mode at `/tiles/berlin/tileset.json`
- verify the transform path in `scene.ts` still positions the tiles correctly
- only change origin/transform code if the offline dataset requires it
- keep the online modes available behind configuration

Checks to satisfy:
- real Berlin tiles load locally
- no Cesium auth is required in local-static mode
- tile placement remains correct relative to the existing player spawn/origin setup

Constraints for this task:
- do not use `any`
- keep edits focused on berlin-flight
- do not remove current fallback paths yet
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 6 - Add offline-focused diagnostics

Objective:
Make offline failures easy to distinguish from rendering failures.

Actions:

1. Extend debug stats to report source mode and source URL.
2. Add explicit logs for:
   - source resolution
   - missing tile root
   - tile load failure
   - auth path selected
3. Add a visible debug note in the existing overlay when local-static mode is active.

Checks:

- you can tell whether a failure is data-path, auth-path, or render-path related
- headset testing no longer requires guessing from an empty scene

Coding-agent prompt:

```text
Improve berlin-flight diagnostics for offline tiles mode.

Task:
- extend the existing berlin-flight debug path so it surfaces source mode and effective tileset URL
- add concise logs around source resolution and tile load failures
- show when local-static mode is active in the existing debug tooling
- keep the debug additions lightweight

Checks to satisfy:
- local-static mode is obvious in logs or debug UI
- missing tile files and render failures are distinguishable
- no per-frame allocation-heavy debug code is added

Constraints for this task:
- do not use `any`
- keep debug work inside the berlin-flight folder
- preserve VR performance
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 7 - Optimize the offline payload for Quest

Objective:
Reduce bandwidth, storage, and draw pressure enough for headset use.

Actions:

1. Measure startup behavior and in-flight tile churn on Quest.
2. If needed, reduce the offline dataset to a smaller Berlin clip.
3. Prefer reducing data scope before rewriting runtime logic.
4. Tune `TilesRenderer` settings only after dataset size is under control.

Checks:

- Quest can enter the scene without long stalls
- LAN transfer is acceptable
- frame pacing remains usable in VR

Coding-agent prompt:

```text
Tune berlin-flight for Quest using the offline local tileset, with minimal architecture change.

Task:
- inspect the current `TilesRuntimeAdapter` configuration
- make only targeted tuning changes that help offline headset performance
- prefer dataset-scope assumptions and renderer tuning over broad runtime rewrites
- document any required asset-side constraints in a short note

Checks to satisfy:
- the app still uses `3d-tiles-renderer`
- no online services are required
- performance-related changes are justified and localized

Constraints for this task:
- do not use `any`
- keep code changes small and measurable
- avoid speculative abstractions
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 8 - Cut over to offline-first configuration

Objective:
Make offline local tiles the default operating mode for the installation.

Actions:

1. Add a clear configuration default for local-static mode.
2. Keep online modes available only as explicit fallback or development modes.
3. Remove any requirement that Cesium credentials exist for the normal installation path.
4. Update local deployment docs.

Checks:

- the installation works on LAN without internet by default
- missing Cesium credentials no longer break the normal path
- operators have one clear startup path

Coding-agent prompt:

```text
Make berlin-flight offline local-static mode the default installation path while preserving explicit fallback modes.

Task:
- update the berlin-flight source selection defaults
- ensure the normal installation path does not require Cesium credentials
- keep online source modes as explicit alternatives, not the default
- add a short operator-facing note for local deployment and expected tile location

Checks to satisfy:
- offline mode is the default
- the app still compiles without public Cesium env vars for the normal path
- fallback modes remain possible through configuration

Constraints for this task:
- do not use `any`
- keep the change isolated to the Berlin experience and its config path
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

### Phase 9 - Final offline acceptance pass

Objective:
Prove the installation works with no internet.

Actions:

1. Disconnect the serving machine from the internet.
2. Keep local LAN active for app hosting and websockets.
3. Launch the app on the headset.
4. Verify tiles load, flight works, and no external requests are attempted.

Checks:

- `/vr` loads on the headset over LAN
- Berlin tiles load fully enough for the intended route
- websocket controls still work over LAN
- no requests hit `api.cesium.com`, `cesium.com`, `googleapis.com`, or other external tile hosts

Coding-agent prompt:

```text
Perform the final berlin-flight offline acceptance hardening pass.

Task:
- review the current berlin-flight offline path for any hidden online dependency
- tighten logs, config, and failure messages where needed
- do not introduce new features
- focus on making the no-internet LAN-only installation predictable

Checks to satisfy:
- no external tile/auth host is required in the default path
- LAN websocket behavior is unaffected
- the offline path is clearly documented and debuggable

Constraints for this task:
- do not use `any`
- do not broaden scope beyond berlin-flight offline readiness
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

## Decision Rules During Implementation

Use these rules while executing the steps:

1. Keep `3d-tiles-renderer` unless a blocker is proven.
2. Prefer changing source resolution over changing rendering architecture.
3. Prefer static local serving over browser caching for the primary offline path.
4. Prefer clipping/reducing the dataset over making the runtime more complex.
5. Treat data rights as a gate, not a footnote.

## Minimal Success Definition

The migration is successful when all of these are true:

1. A local machine on the LAN serves the app and Berlin tiles over HTTPS.
2. The Quest opens `berlin-flight` without internet access.
3. `berlin-flight` loads Berlin from `/tiles/berlin/tileset.json`.
4. No Cesium token exchange is required in the default path.
5. Flight and websocket control continue working.

## Recommended Execution Order

Run the prompts in this order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9

Do not skip Phase 0. The legal/download answer determines whether the rest of the plan uses the current asset or a replacement dataset.
