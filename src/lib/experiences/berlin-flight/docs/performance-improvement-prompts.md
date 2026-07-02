# Berlin Flight Performance Improvement Prompts

## Purpose

Provide focused coding-agent prompts for the highest-value Berlin Flight performance improvements without broadening scope or redesigning the experience.

These prompts are intentionally narrow and should be executed one at a time.

---

## Prompt 1 - Clamp pixel ratio on Quest

### Objective

Reduce fragment workload by avoiding full `window.devicePixelRatio` rendering in the VR shell.

### Coding-agent prompt

```text
Perform a small VR-shell performance pass to clamp render pixel ratio for headset use.

Task:
- inspect `src/routes/vr/+page.svelte`
- replace the current unconditional `renderer.setPixelRatio(window.devicePixelRatio)` with a conservative capped value
- keep the cap simple, for example `1` or `Math.min(window.devicePixelRatio, 1.25)`
- keep the change local to the VR shell
- preserve the current resize behavior

Checks to satisfy:
- renderer setup still works for desktop and Quest
- no `any`
- no change to the experience manifest API

Constraints for this task:
- prefer the smallest working diff
- do not add a new settings system for this
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 2 - Disable shadows for Berlin

### Objective

Stop paying for realtime shadow maps in a city experience that does not need them.

### Coding-agent prompt

```text
Disable unnecessary shadow-map work for Berlin Flight with the smallest possible change.

Task:
- inspect `src/routes/vr/+page.svelte`
- inspect `src/lib/experiences/berlin-flight/scene.ts`
- identify the narrowest place to disable shadows for the Berlin experience without breaking other experiences
- implement that change
- preserve current lighting and cleanup behavior

Checks to satisfy:
- Berlin no longer depends on realtime shadow maps
- unrelated experiences keep their current behavior unless the shared shell cannot avoid a global change
- TypeScript stays strict

Constraints for this task:
- do not redesign the renderer setup
- do not add a new abstraction unless it is required by the existing experience API
- use the fewest files possible
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 3 - Make Berlin tile materials opaque

### Objective

Reduce transparent rendering cost across the streamed city tiles.

### Coding-agent prompt

```text
Perform a surgical material-cost reduction pass for Berlin Flight by removing unnecessary transparency from tile materials.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-material.ts`
- change the Berlin tile material cloning path so tiles render as opaque unless there is a clear local reason not to
- keep the existing Berlin tile look as close as practical while prioritizing performance
- preserve cleanup and disposal correctness

Checks to satisfy:
- Berlin tile materials no longer force the expensive transparent path
- material cloning and disposal still work
- no `any`

Constraints for this task:
- keep the edit local to berlin-flight
- do not introduce a new material system
- prefer deletion over extra configuration
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 4 - Simplify the Berlin tile shader

### Objective

Cut fragment shader cost from the custom cone-mask and flat-shading path.

### Coding-agent prompt

```text
Simplify Berlin Flight's custom tile shader work to reduce GPU cost while preserving the core visual behavior.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-material.ts`
- review the `onBeforeCompile` shader modifications, especially the fragment work using derivatives like `dFdx` and `dFdy`
- remove or simplify the most expensive custom shading path if it is not essential to the effect
- keep the diff surgical and local
- preserve material disposal behavior

Checks to satisfy:
- the shader path is cheaper than before
- Berlin still renders correctly
- no new global renderer dependency is introduced

Constraints for this task:
- do not migrate to NodeMaterial or WebGPU
- do not rewrite the whole material file unless required
- add a short code comment only if the simplified tradeoff is non-obvious
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 5 - Gate collision and cone systems

### Objective

Stop running heavy per-frame mesh, cone, and collision work when the Berlin demo does not need it.

### Coding-agent prompt

```text
Add the smallest practical gate around Berlin Flight's expensive collision and cone-processing systems.

Task:
- inspect `src/lib/experiences/berlin-flight/scene.ts`
- inspect `src/lib/experiences/berlin-flight/collision/controller.ts`
- inspect `src/lib/experiences/berlin-flight/placement/controller.ts`
- inspect `src/lib/experiences/berlin-flight/cone-placement/controller.ts`
- identify a simple local switch or early-exit path that can disable collision/cone processing when not needed
- wire that gate into the existing Berlin experience flow
- preserve current cleanup and debug safety

Checks to satisfy:
- when the gate is off, Berlin skips the heavy per-frame collision and cone pipeline
- when the gate is on, existing behavior remains intact
- no `any`

Constraints for this task:
- keep the change inside `src/lib/experiences/berlin-flight/` unless one small shell change is truly required
- do not redesign the experience architecture
- prefer one local boolean or setting over a new subsystem
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Prompt 6 - Tune tile detail before renderer changes

### Objective

Lower tile streaming and LOD cost in the existing WebGL path before considering WebGPU.

### Coding-agent prompt

```text
Perform a focused LOD and tile-runtime tuning pass for Berlin Flight in the existing WebGL renderer path.

Task:
- inspect `src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts`
- review current `TilesRenderer` settings such as `errorTarget` and any related quality or cache behavior already exposed by the runtime
- make a conservative tuning pass aimed at Quest-class VR performance
- keep the existing adapter boundary intact
- document the local tuning assumption in `src/lib/experiences/berlin-flight/docs/lab-notes.md`

Checks to satisfy:
- Berlin uses a more conservative tile-detail target than before
- the runtime still loads and disposes tiles correctly
- the tuning remains local to berlin-flight

Constraints for this task:
- do not migrate to WebGPU
- do not replace `3d-tiles-renderer`
- do not broaden scope into unrelated experiences
- run `bunx biome check --write .`
- run `bunx svelte-check --threshold warning`
```

---

## Order of Operations

Recommended order:

1. Clamp pixel ratio
2. Disable shadows for Berlin
3. Make tile materials opaque
4. Gate collision and cone systems
5. Simplify the tile shader
6. Tune tile detail and cache behavior

This order favors the cheapest, highest-impact changes first.
