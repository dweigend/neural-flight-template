# Berlin Flight — Cesium ion 3D Tiles Integration Plan

## Goal

Create a new experience at `src/lib/experiences/berlin-flight/` that lets the existing flight controller fly over **Berlin Mitte** in VR, while keeping the repo's current **Three.js + WebXR** runtime model.

This plan is based on the recommended integration strategy:

- **Use Cesium ion-hosted 3D Tiles as the content source**
- **Render the city in a Three.js-based runtime**
- **Do not use CesiumJS as the primary VR renderer**
- **Optimize for browser-based VR headset performance**

---

## Chosen Architecture

### Runtime

Keep the repo's existing runtime stack:

- `three`
- `WebXR`
- repo experience lifecycle (`manifest.ts`, `scene.ts`, `player.ts`, `settings.ts`, `index.ts`)
- existing `/vr` route and animation loop

### Data / Streaming

Use Cesium's ecosystem for geospatial delivery:

- **Cesium ion-hosted 3D Tiles**
- Berlin Mitte as the first geographic target
- browser streaming allowed from the beginning

### Rendering Strategy

Use a **Three-compatible 3D Tiles runtime / loader** rather than CesiumJS `Viewer`.

This keeps:

- the current flight controller architecture
- the existing VR route
- one render loop
- one main `THREE.Scene`
- one main WebXR renderer

It avoids:

- dual renderers
- dual camera ownership
- CesiumJS widget lifecycle conflicts
- forcing CesiumJS into a role it is not best suited for in this repo

---

## Non-Goals for Phase 1

These are explicitly out of scope for the first implementation:

- WebGPU-first rendering
- replacing `src/routes/vr/+page.svelte`
- switching the entire app to CesiumJS `Viewer`
- full-Berlin coverage
- offline/self-hosted tiles
- perfect terrain collision / simulation realism

---

## Performance Baseline

Because the target is a VR headset browser and the exact model is unknown, phase 1 should optimize for the safest baseline:

- **WebXR + WebGL**, not WebGPU
- small geographic scope: **Berlin Mitte**
- aggressive culling / LOD awareness
- low-overhead debug overlays
- minimal per-frame allocations
- early-exit logic in update loops

If later testing proves a specific headset can handle more, scope can expand.

---

## Folder Scope Rule

All implementation steps in this plan must stay inside:

- `src/lib/experiences/berlin-flight/`

The plan may reference repo files outside that folder for understanding, but each implementation step should be written so the assigned coding agent edits only files inside `src/lib/experiences/berlin-flight/`.

---

## High-Level File Layout Target

The final experience should stay modular and avoid godfiles.

Recommended target structure:

```text
src/lib/experiences/berlin-flight/
  integration-plan.md
  index.ts
  manifest.ts
  scene.ts
  player.ts
  settings.ts
  constants.ts
  types.ts
  runtime/
    tiles-runtime.ts
    camera-rig.ts
    cleanup.ts
  geo/
    berlin-mitte-origin.ts
    coordinates.ts
  debug/
    overlay.ts
  lab-notes.md
```

Notes:

- Keep files around or below **200 LOC** where practical.
- Split logic early instead of waiting for one large file to grow.
- Add cleanup/dispose behavior in every runtime helper.

---

## Recommended Order of Execution

Execute in this order:

1. **Phase 0 — Research + constraints capture**
2. **Phase 1 — Scaffold the new experience**
3. **Phase 2 — Define Berlin Mitte origin and coordinate policy**
4. **Phase 3 — Evaluate and select a Three.js 3D Tiles runtime**
5. **Phase 4 — Build a minimal hosted-tiles smoke test inside the experience**
6. **Phase 5 — Integrate the flight controller with the tile scene**
7. **Phase 6 — Add visibility, lifecycle, and cleanup hardening**
8. **Phase 7 — Add debug instrumentation and tuning hooks**
9. **Phase 8 — Optimize for VR browser performance**
10. **Phase 9 — Final validation pass and implementation notes**

Do not skip the smoke-test phase. Proving tile loading first is more important than adding polished flight behavior too early.

---

# Step-by-Step Implementation Guide

Each phase below includes:

- objective
- deliverables
- checks
- a ready-to-use coding-agent prompt

Every prompt includes the requested constraints.

---

## Shared Coding-Agent Constraints

Include the following block in **every** implementation step prompt:

```text
Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 0 — Research + constraints capture

### Objective

Capture the integration assumptions inside the experience folder so later implementation is consistent.

### Deliverables

- `integration-plan.md` refined if needed
- `lab-notes.md` containing:
  - target area: Berlin Mitte
  - hosted data strategy: Cesium ion
  - runtime target: Three.js + WebXR
  - explicit note that WebGPU is deferred
  - shortlist of candidate 3D Tiles loaders/runtimes for Three.js

### Checks

- The notes clearly state why CesiumJS `Viewer` is not the primary runtime.
- The notes clearly state that phase 1 targets WebGL/WebXR.
- No implementation files are created yet beyond notes/planning.

### Coding-Agent Prompt

```text
Create or refine planning notes for the new experience under `src/lib/experiences/berlin-flight/`.

Task:
- preserve `integration-plan.md`
- add a `lab-notes.md` file that captures the agreed technical direction for Berlin Mitte
- include a short comparison of using CesiumJS Viewer vs rendering Cesium-produced 3D Tiles inside a Three.js runtime
- include a shortlist of candidate Three-compatible 3D Tiles runtimes/loaders to evaluate in the next step
- explicitly mark WebGPU as deferred and WebXR + WebGL as the phase-1 target

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

## Phase 0.1 — Environment and Dependencies

### Objective

Ensure the project has the necessary credentials and libraries to communicate with Cesium ion.

### Deliverables

- `.env` file updated with `PUBLIC_CESIUM_ION_TOKEN`
- `package.json` updated with the selected 3D Tiles runtime (e.g., `3d-tiles-renderer`)
- `src/lib/experiences/berlin-flight/constants.ts` updated to reference these variables

### Checks

- `.env` contains a valid Cesium ion token with the `PUBLIC_` prefix.
- `package.json` includes the 3D Tiles renderer dependency.
- No CDN imports are used for core libraries to avoid "Multiple instances of Three.js" errors.

### Coding-Agent Prompt

```text
Prepare the environment and dependencies for the Berlin Flight experience.

Task:
- add `PUBLIC_CESIUM_ION_TOKEN` and `PUBLIC_BERLIN_ION_ASSET_ID` to the root `.env` file
- add the `3d-tiles-renderer` dependency to `package.json` (use `bun add 3d-tiles-renderer`)
- ensure `src/lib/experiences/berlin-flight/constants.ts` is ready to use these environment variables

Requirements:
- use the `PUBLIC_` prefix for all environment variables intended for the browser
- avoid CDN imports (esm.sh) for libraries that depend on Three.js to prevent multiple instance conflicts
```

---

## Phase 1 — Scaffold the new experience

### Objective

Create the minimal experience structure so the Berlin work has a clean home.

### Deliverables

Required files:

- `index.ts`
- `manifest.ts`
- `scene.ts`
- `player.ts`
- `settings.ts`
- `types.ts`
- `constants.ts`

Initial behavior:

- empty or placeholder scene
- no tile integration yet
- valid cleanup/dispose structure
- explicit state shape for the experience

### Checks

- Files are modular and small.
- `scene.ts` does not accumulate unrelated responsibilities.
- `dispose()` exists and safely handles partially initialized state.
- `player.ts` can accept orientation data without crashing even before tile loading exists.

### Coding-Agent Prompt

```text
Scaffold a new experience under `src/lib/experiences/berlin-flight/`.

Create these files:
- `index.ts`
- `manifest.ts`
- `scene.ts`
- `player.ts`
- `settings.ts`
- `types.ts`
- `constants.ts`

Requirements:
- follow the existing repo experience pattern conceptually
- keep the first version intentionally minimal
- define explicit types for the Berlin experience state
- include setup, tick, updatePlayer, applySettings, and dispose wiring
- include cleanup-safe placeholder logic for an empty scene
- keep files small and focused

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 2 — Define Berlin Mitte origin and coordinate policy

### Objective

Establish one local-world coordinate system before tile integration begins.

### Deliverables

Recommended files:

- `geo/berlin-mitte-origin.ts`
- `geo/coordinates.ts`

Define:

- reference geographic origin for Berlin Mitte
- local axis conventions
- conversion helpers and documentation
- assumptions about meters, world up, and local offsets

### Checks

- One origin is clearly defined and named.
- Conversion helpers are isolated from rendering logic.
- No magic coordinate transforms are hidden in `scene.ts`.
- The notes explain how future tile content maps into local world space.

### Coding-Agent Prompt

```text
Add geospatial foundation files under `src/lib/experiences/berlin-flight/` for Berlin Mitte.

Create a small `geo/` module set that defines:
- the chosen Berlin Mitte geographic origin
- local world-axis conventions
- helper functions for converting between source geographic coordinates and local world-space assumptions used by the experience

Requirements:
- keep the helpers renderer-agnostic where possible
- document assumptions in code comments only where necessary for non-obvious intent
- do not add Cesium runtime code yet
- do not mix coordinate policy directly into `scene.ts`

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 3 — Evaluate and select a Three.js 3D Tiles runtime

### Objective

Choose the loader/runtime layer that will consume Cesium ion-hosted 3D Tiles inside the Three.js experience.

### Deliverables

- `lab-notes.md` updated with a decision
- optional small adapter placeholder file, e.g.:
  - `runtime/tiles-runtime.ts`

The decision should compare candidate options on:

- active maintenance
- TypeScript ergonomics
- Three.js compatibility
- LOD/streaming support
- browser-VR friendliness
- cleanup/disposal story
- ability to work with hosted Cesium ion data

### Checks

- One runtime is selected.
- The choice is justified in the notes.
- The adapter boundary is clear so vendor-specific logic does not spread everywhere.

### Coding-Agent Prompt

```text
Within `src/lib/experiences/berlin-flight/`, document and prepare the 3D Tiles runtime integration boundary.

Task:
- update `lab-notes.md` with a concrete decision for a Three.js-compatible 3D Tiles runtime/loader to evaluate first for Cesium ion-hosted tiles
- add a placeholder adapter file such as `runtime/tiles-runtime.ts` that defines the local interface the experience will rely on later
- keep the adapter generic enough that the underlying loader could be swapped if needed

Requirements:
- do not add a full implementation yet
- focus on the decision and the adapter shape
- keep loader-specific details isolated behind the adapter boundary

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 4 — Build a minimal hosted-tiles smoke test

### Objective

Prove that Cesium ion-hosted Berlin Mitte 3D Tiles can be loaded into the new Three-based experience using the configured API key.

### Deliverables

Recommended files:

- `runtime/tiles-runtime.ts`
- `runtime/cleanup.ts`
- `scene.ts` updated to initialize the tiles runtime
- `types.ts` updated with runtime state

Behavior:

- load a small Berlin Mitte tile scene
- attach it to the experience world root
- expose loading state
- fail safely if auth/config/data is missing
- clean up allocated objects on dispose

### Checks

- Tile content appears without flight logic complexity dominating the test.
- Initialization failure paths early-exit safely.
- Disposal path removes world content and frees resources.
- No per-frame reinitialization or accidental repeated loads.

### Coding-Agent Prompt

```text
Implement the first hosted 3D Tiles smoke test for `src/lib/experiences/berlin-flight/`.

Task:
- implement the runtime adapter created earlier so the experience can initialize a Cesium ion-hosted Berlin Mitte 3D Tiles scene inside the Three.js experience world
- update local experience files in this folder only so setup initializes the runtime, tick can observe readiness, and dispose fully cleans up
- keep the first integration minimal: loading proof first, polish later

Requirements:
- isolate loader/runtime details behind local adapter functions/types
- add explicit loading/error state to local experience types
- prefer early exits for missing config, failed loads, or incomplete state
- do not let `scene.ts` become a godfile
- add cleanup helpers for all created objects/resources

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 5 — Integrate the flight controller with the tile scene

### Objective

Attach the existing flight interaction model to the Berlin scene without coupling input logic to tile loading internals.

### Deliverables

Recommended files:

- `player.ts`
- `runtime/camera-rig.ts`
- `scene.ts` updates
- `types.ts` updates

Behavior:

- orientation input affects heading/bank/pitch as intended
- camera starts in a valid Berlin Mitte spawn area
- forward motion works over the tile scene
- keyboard fallback may exist if useful for debugging

### Checks

- Tile runtime still works when no orientation data arrives.
- Flight updates are independent from tile-stream lifecycle.
- Spawn logic is explicit and does not depend on hidden tile side effects.
- Cleanup detaches event listeners or controls.

### Coding-Agent Prompt

```text
Connect flight behavior to the Berlin tiles experience in `src/lib/experiences/berlin-flight/`.

Task:
- add a small camera/player rig abstraction if needed
- update `player.ts` and local scene/runtime files so orientation-driven flight can move through the Berlin Mitte tile scene
- keep tile loading and flight input concerns separated
- support safe behavior before tiles finish loading

Requirements:
- use explicit local types
- use early exits when player state or runtime state is incomplete
- keep motion logic compact and testable
- add cleanup for any listeners, controls, or helper objects you create

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 6 — Add visibility, lifecycle, and cleanup hardening

### Objective

Make the experience resilient under repeated load/unload cycles and partial failures.

### Deliverables

Recommended files:

- `runtime/cleanup.ts`
- `runtime/tiles-runtime.ts`
- `scene.ts`
- `types.ts`

Focus areas:

- repeated enter/exit of VR route
- repeated experience loads
- partial tile load failure handling
- cancellation guards during async setup
- deterministic disposal ordering

### Checks

- No duplicate roots or duplicate runtime instances.
- Async loads do not attach after disposal.
- Dispose can be called safely more than once.
- Error states do not leave orphaned objects in the scene.

### Coding-Agent Prompt

```text
Harden lifecycle and cleanup behavior for the Berlin tiles experience under `src/lib/experiences/berlin-flight/`.

Task:
- review local runtime setup/dispose flow and make it resilient to repeated load/unload cycles and async race conditions
- improve cancellation guards and cleanup ordering
- keep all edits inside this experience folder

Requirements:
- dispose must be safe for partially initialized state
- async tile initialization must not attach content after the experience has been disposed
- keep responsibilities split across small files instead of growing one large scene file

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 7 — Add debug instrumentation and tuning hooks

### Objective

Expose the minimum diagnostics needed to understand tile loading and VR behavior without bloating runtime costs.

### Deliverables

Recommended files:

- `debug/overlay.ts`
- `settings.ts`
- `constants.ts`
- `types.ts`

Possible debug outputs:

- tiles runtime status
- camera local position
- current spawn/origin info
- basic loading/error state
- optional toggleable overlay

### Checks

- Overlay is optional and cheap.
- Debug state does not allocate large objects every frame.
- Settings hooks are local and explicit.
- Cleanup removes overlay resources and helpers.

### Coding-Agent Prompt

```text
Add lightweight debug instrumentation to `src/lib/experiences/berlin-flight/`.

Task:
- create a small debug overlay/helper module
- expose key state for Berlin tiles loading and flight debugging
- wire any needed settings or constants inside this folder only
- keep runtime overhead low and make the overlay easy to disable

Requirements:
- avoid per-frame allocations where possible
- use early exits when debug mode is disabled
- add cleanup for textures, materials, sprites, or helper objects if created
- keep modules small and focused

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 8 — Optimize for VR browser performance

### Objective

Reduce frame-time risk for headset browsers without changing the architecture.

### Deliverables

Potential local changes:

- tighten camera far plane strategy
- guard optional helpers
- reduce overlay cost
- reduce update frequency for non-critical runtime work
- tune spawn area and initial view
- document performance assumptions in `lab-notes.md`

### Checks

- Nonessential work can be disabled.
- Expensive debug tools are not always-on.
- Per-frame work uses early exits.
- Tile updates are not duplicated across unrelated systems.

### Coding-Agent Prompt

```text
Perform a focused performance pass on the Berlin tiles experience under `src/lib/experiences/berlin-flight/`.

Task:
- review local per-frame logic, debug helpers, and tile runtime integration for browser-VR friendliness
- reduce unnecessary work using early exits and optional feature guards
- document any important local performance assumptions in `lab-notes.md`

Requirements:
- do not redesign the architecture
- keep the pass surgical and local to this experience folder
- preserve cleanup/dispose correctness
- keep files small and maintainable

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

---

## Phase 9 — Final validation pass and implementation notes

### Objective

Leave the folder with a usable implementation record and clear next steps.

### Deliverables

- `lab-notes.md` updated with:
  - what worked
  - current limits
  - unresolved risks
  - next improvements
- local code cleanup pass
- confirmation that the modular structure stayed intact

### Checks

- No obvious godfiles emerged.
- Disposal paths remain present across modules.
- The folder documents what depends on external tile/auth configuration.
- Remaining issues are explicit rather than hidden.

### Coding-Agent Prompt

```text
Perform a final local cleanup and implementation-notes pass for `src/lib/experiences/berlin-flight/`.

Task:
- review the local experience folder for modularity, cleanup safety, and documentation clarity
- update `lab-notes.md` with current behavior, limitations, unresolved risks, and suggested next steps
- keep changes local to this experience folder only

Requirements:
- preserve small-file structure
- do not introduce new architecture changes in this pass
- make remaining follow-up work explicit

Constraints for this task:
- primarily edit files in src/lib/experiences/berlin-flight
- you may edit package.json and .env if dependencies or environment variables are required
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Add cleanup/dispose logic for everything you create
- Make a regular git commit when this step is complete
```

# Suggested Validation Workflow Per Phase

After each implementation phase, run the most specific checks first.

## Minimum review checklist

- file count still feels modular
- no file is drifting into a godfile
- all created resources have a cleanup path
- async setup code has disposal guards
- early exits exist for incomplete runtime state

## Recommended command checks

Project-wide standards from this repo suggest:

```bash
bunx biome check --write .
bunx svelte-check --threshold warning
```

However, because this plan is scoped to `src/lib/experiences/berlin-flight/`, the assigned agent should:

1. finish the local step
2. run repo validation only if the step requires it and the user wants it
3. report any unrelated failures separately

---

# Suggested Milestones

## Milestone A

Experience scaffold exists and is lifecycle-safe.

Complete when:

- Phase 1 and Phase 2 are done
- local state/types/coordinate policy are in place

## Milestone B

Hosted Berlin Mitte tiles render in the new experience.

Complete when:

- Phase 3 and Phase 4 are done
- a smoke test loads visible city content

## Milestone C

Berlin scene is flyable in the existing VR runtime.

Complete when:

- Phase 5 and Phase 6 are done
- the experience survives reload/dispose cycles

## Milestone D

Experience is debuggable and reasonably tuned for headset browsers.

Complete when:

- Phase 7 through Phase 9 are done

---

# Risks to Watch

## 1. Runtime mismatch risk

Trying to use CesiumJS `Viewer` directly inside the current VR shell would likely create renderer and camera ownership conflicts.

**Mitigation:** keep Cesium as the content source and Three.js as the runtime.

## 2. Performance risk on unknown headset browsers

Berlin city geometry may be too heavy if the selected tileset is large or the runtime is not tuned.

**Mitigation:** start with Berlin Mitte only, keep debug tools optional, and optimize per-frame logic early.

## 3. Loader/runtime lock-in risk

A chosen 3D Tiles runtime may later show weaknesses.

**Mitigation:** keep a local adapter boundary in `runtime/tiles-runtime.ts`.

## 4. Async lifecycle bugs

Streaming content often attaches late or leaks resources after unload.

**Mitigation:** design dispose/cancellation behavior as a first-class concern, not an afterthought.

---

# Final Recommendation

Implement Berlin as a **new Three.js/WebXR experience** that consumes **Cesium ion-hosted 3D Tiles** through a **Three-compatible tiles runtime**, starting with **Berlin Mitte** and optimizing for **browser-based VR performance** rather than WebGPU.

That is the best balance of:

- compatibility with this repo
- realistic implementation effort
- VR runtime stability
- future scalability
