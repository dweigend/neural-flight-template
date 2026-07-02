# Berlin Flight Adapter Simplification Prompts

## Purpose

Provide focused coding-agent prompts for simplifying the current Berlin Flight tile adapter without replacing `3d-tiles-renderer`, redesigning the experience, or pulling Cesium `Viewer` into the VR shell.

These prompts are intentionally narrow and should be executed one at a time.

---

## Prompt 1 - Remove non-essential adapter surface

### Objective

Shrink `TilesRuntimeAdapter` to the methods Berlin Flight actually uses today.

### Coding-agent prompt

```text
Perform a small API-surface reduction pass on the Berlin Flight tile adapter.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- inspect `src/lib/experiences/berlin-flight/scene.ts`
- inspect `src/lib/experiences/berlin-flight/types.ts`
- identify adapter methods and state that are not needed by the current Berlin Flight flow
- remove dead or redundant adapter surface where it is safe to do so
- keep the existing Berlin scene behavior unchanged

Checks to satisfy:
- Berlin still loads, updates, and disposes the tileset correctly
- adapter methods still used by `scene.ts` remain intact
- no `any`

Constraints for this task:
- prefer deletion over renaming
- do not add a new abstraction layer
- keep the change local to `src/lib/experiences/berlin-flight/`
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 2 - Inline one-shot load state

### Objective

Simplify the adapter's initialization path by collapsing state that only exists to defend against flows Berlin does not use.

### Coding-agent prompt

```text
Simplify the Berlin Flight tile adapter's async setup path with the smallest practical diff.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- inspect how `TilesRuntimeAdapter.create(...)` is called from `src/lib/experiences/berlin-flight/scene.ts`
- review whether both `renderer` and `loadPromise` state are needed for the current one-shot setup flow
- simplify the load path if one branch is only supporting unused re-entry behavior
- preserve cancellation and disposal safety

Checks to satisfy:
- adapter creation still works with the existing abort signal path
- disposal during or after load remains safe
- TypeScript stays strict

Constraints for this task:
- do not redesign Berlin scene ownership
- do not broaden the adapter API
- prefer one straightforward load path over generic reusability
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 3 - Move source resolution out of the adapter

### Objective

Keep `TilesRuntimeAdapter` focused on runtime concerns by separating env-based source resolution from renderer setup.

### Coding-agent prompt

```text
Refactor Berlin Flight's tile source resolution so the runtime adapter owns less responsibility.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- inspect `src/lib/experiences/berlin-flight/scene.ts`
- identify the smallest way to move env-based tileset URL and token resolution out of `TilesRuntimeAdapter`
- leave the adapter responsible for loading, updating, and disposing the renderer
- keep external behavior unchanged

Checks to satisfy:
- Berlin still supports the current configured source paths
- env handling remains strict and explicit
- adapter code becomes narrower than before

Constraints for this task:
- do not introduce a generic provider system
- do not move logic outside `src/lib/experiences/berlin-flight/`
- prefer one helper or one plain object over a new class
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 4 - Collapse camera syncing to the Berlin use case

### Objective

Remove generic multi-camera behavior if Berlin only ever drives the adapter with one tile-selection camera.

### Coding-agent prompt

```text
Simplify the Berlin Flight tile adapter's camera-sync logic to match actual usage.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- inspect `src/lib/experiences/berlin-flight/scene.ts`
- verify how many cameras are passed into `TilesRuntimeAdapter.update(...)`
- if Berlin only uses one camera, simplify the adapter's active-camera bookkeeping accordingly
- preserve current WebXR behavior and resolution syncing

Checks to satisfy:
- tile updates still use the correct camera in desktop and XR modes
- no camera leak or stale registration remains
- no `any`

Constraints for this task:
- do not change the tile-selection camera behavior in `scene.ts` unless required
- do not redesign the XR flow
- prefer the smallest removal of generic code that still fits current usage
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 5 - Keep mesh tracking, drop adapter-owned debug shape

### Objective

Retain tracked tile mesh access for placement and collision while simplifying optional adapter-owned debug state.

### Coding-agent prompt

```text
Perform a small simplification pass on Berlin Flight's tile adapter by separating required runtime data from optional debug helpers.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- inspect `src/lib/experiences/berlin-flight/debug/overlay.ts`
- identify whether adapter-owned debug reporting can be reduced without breaking the current overlay
- keep mesh tracking APIs needed by placement and collision
- simplify or trim debug-specific adapter code if it is redundant

Checks to satisfy:
- the debug overlay still shows valid tile runtime information or is updated to read it in a simpler way
- tracked tile meshes remain available to the Berlin scene
- cleanup and disposal still work

Constraints for this task:
- do not remove mesh tracking
- do not build a new diagnostics system
- prefer plain state reads over extra wrapper methods when that reduces code
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 6 - Delete adapter code that duplicates library defaults

### Objective

Reduce local tuning and boilerplate where `3d-tiles-renderer` defaults or existing Berlin call sites already cover the behavior.

### Coding-agent prompt

```text
Audit the Berlin Flight tile adapter for configuration and guard code that duplicates library defaults or unused defensive behavior.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- review renderer tuning, guard methods, and setup boilerplate
- identify settings or helper methods that can be deleted because they restate defaults or protect flows Berlin does not exercise
- keep any tuning that is deliberate for Quest-class VR performance
- document one non-obvious retained tuning choice in `src/lib/experiences/berlin-flight/docs/lab-notes.md`

Checks to satisfy:
- the adapter remains correct for the current Berlin experience
- the remaining tuning is intentional rather than accidental
- TypeScript stays strict

Constraints for this task:
- do not remove performance-relevant tuning blindly
- do not replace `3d-tiles-renderer`
- prefer fewer helpers and fewer branches over more comments
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Order of Operations

Recommended order:

1. Remove non-essential adapter surface
2. Inline one-shot load state
3. Move source resolution out of the adapter
4. Collapse camera syncing to the Berlin use case
5. Keep mesh tracking, drop adapter-owned debug shape
6. Delete adapter code that duplicates library defaults

This order favors narrowing the adapter boundary before touching behavior-sensitive runtime details.
