# Berlin Flight - Debug / Cone Visual Fix Prompts

Focused coding-agent prompts for fixing the current Berlin Flight visual gaps one by one.

Context:
- `berlin-flight` currently shows buildings, but expected debug markers, cone meshes, and strong cone-driven visual feedback are missing.
- The current runtime uses:
  - streamed 3D tiles for buildings
  - `BerlinConeGridRuntime` for precomputed cones
  - `BerlinCollisionController` for cone-to-building masking
- The current scene no longer wires the old placement debug-marker controllers into runtime.
- The current material path does not implement a real image/decal/projected-texture feature; it only blends neutral shading outside cone-covered regions.

Constraints:
- keep diffs small and local to `src/lib/experiences/berlin-flight/`
- follow `AGENTS.md`
- no `any`
- use existing Berlin patterns before adding new structure
- use `apply_patch` for edits
- run:
  - `bunx biome check --write .`
  - `bunx svelte-check --threshold warning`
- do not commit unless asked

---

## Prompt 1 - Restore placement debug markers in runtime

The Berlin Flight experience has debug marker systems in:
- `src/lib/experiences/berlin-flight/placement/controller.ts`
- `src/lib/experiences/berlin-flight/cone-placement/controller.ts`

But the current runtime in:
- `src/lib/experiences/berlin-flight/scene.ts`

does not instantiate or update those controllers anymore, so their markers can never appear.

Task:
1. Reconnect the placement debug pipeline into the live `berlin-flight` scene.
2. Instantiate the placement controller and cone-placement controller during setup.
3. Update them from tracked tile meshes during tick.
4. Make their marker visibility follow the existing Berlin debug toggle.
5. Dispose them cleanly.

Requirements:
- keep the current precomputed cone runtime intact
- do not replace `BerlinConeGridRuntime`
- do not remove the existing collision flow
- keep debug-marker ownership Berlin-local
- keep the change small and obvious

Deliver:
- working marker wiring
- short summary of which controllers were reconnected
- note any assumptions about whether markers represent roof-corner points, cone axes, or both

---

## Prompt 2 - Make cone meshes reliably visible

The current precomputed cone runtime lives in:
- `src/lib/experiences/berlin-flight/runtime/cone-grid-runtime.ts`

Observed risks:
- cone root starts hidden and only depends on the debug toggle
- the cone `InstancedMesh` does not explicitly disable frustum culling
- cones may be loaded but still not visible enough for debugging

Task:
1. Audit the cone visibility path.
2. Make sure loaded cones are actually visible when Berlin debug visuals are enabled.
3. Fix any frustum-culling or visibility-state issue that can hide the cone instanced mesh.
4. Keep normal non-debug behavior unchanged unless a minimal fix requires otherwise.

Requirements:
- prefer the smallest possible fix
- do not redesign the debug system
- do not change cone dataset loading semantics
- do not add a new settings system unless the current toggle is insufficient

Deliver:
- exact root cause found
- exact visibility fix made
- confirmation whether the issue was hidden root state, culling, material readability, or a combination

---

## Prompt 3 - Make cone-driven building masking visually obvious

The current building material override lives in:
- `src/lib/experiences/berlin-flight/runtime/tiles-material.ts`

Right now it preserves original building texture/material inside the cone mask and applies neutral shading outside it. That can be too subtle to read in headset testing, even when collision is technically working.

Task:
1. Keep the current cone-mask collision flow.
2. Change the material result so cone-covered building regions are unmistakably visible during debugging.
3. Use the smallest shader/material change that gives a strong visual proof.
4. Keep streamed tile rendering intact.

Requirements:
- no new rendering dependency
- no new material architecture unless necessary
- prefer a stronger color/debug blend before inventing a texture system
- keep the existing `coneMask` attribute pipeline

Good outcomes:
- cone-covered regions render in a strong debug color
- the effect is easy to spot in VR
- the code still works with streamed 3D tiles and the current collision controller

Deliver:
- what changed in the shader/material path
- why the previous look was too subtle
- whether the result is intended as temporary debug rendering or a durable visual mode

---

## Prompt 4 - Add explicit runtime diagnostics for missing or empty cone data

The cone runtime and asset loading paths live in:
- `src/lib/experiences/berlin-flight/runtime/cone-grid-runtime.ts`
- `src/lib/experiences/berlin-flight/cone-data/runtime-store.ts`
- `src/lib/experiences/berlin-flight/cone-data/asset-loader.ts`
- `src/lib/experiences/berlin-flight/debug/overlay.ts`

Right now failures can be easy to miss in-headset. If chunks are missing, empty, out of bounds, or not active near the player, the user just sees buildings and assumes rendering is broken.

Task:
1. Improve runtime diagnostics for the cone-data path.
2. Make it obvious when:
   - the manifest is missing
   - a chunk file is missing
   - chunks load but contain no active cones near the player
   - cone load errors are present
3. Surface the smallest useful diagnostics in the existing Berlin debug overlay.

Requirements:
- keep diagnostics lightweight
- reuse the existing overlay instead of building a second UI
- no noisy logging every frame
- do not change dataset format unless truly needed

Deliver:
- exact diagnostics added
- where they appear
- which failure modes they distinguish

---

## Prompt 5 - Implement a real image-based cone visual mode

This is a separate feature task, not a bug fix.

Important context:
- the current runtime does **not** implement image-based cone visuals
- the current material only uses `coneMask` to blend neutral shading vs original tile texture
- heatmap PNG assets are offline inputs for cone generation density, not runtime display textures

Task:
1. Design and implement the smallest real image-based visual mode for cone-covered areas in `berlin-flight`.
2. Keep the current streamed 3D tiles + cone collision architecture.
3. Reuse the existing `coneMask` signal if possible.
4. Choose one concrete approach and implement only that:
   - textured debug tint in shader
   - projected texture style blend
   - decal-like building overlay

Requirements:
- do not overbuild multiple modes
- explain the chosen approach and why it fits the existing architecture
- keep performance in mind for WebXR / Quest
- avoid adding dependencies unless the current stack truly cannot support the effect

Deliver:
- one working image-based visual mode
- short tradeoff summary
- note whether it is suitable only for debugging or for production visuals

---

## Prompt 6 - End-to-end validation of Berlin debug visuals

After the above fixes, validate the complete Berlin visual-debug path.

Scope:
- streamed Berlin buildings load
- nearby precomputed cones load
- cone meshes become visible when debug visuals are enabled
- debug markers appear if the placement controllers are wired
- cone/building masking becomes visually obvious

Task:
1. Review the final Berlin runtime wiring end to end.
2. Check for any remaining gaps between:
   - cone dataset loading
   - active cone selection
   - cone mesh rendering
   - debug marker rendering
   - tile mesh masking
3. Fix small leftover issues if they block the visual path.

Requirements:
- keep fixes narrow
- do not broaden into unrelated Berlin refactors
- verify with the existing debug toggle and overlay

Deliver:
- concise list of what was verified
- any remaining limitations
- exact commands run for validation
