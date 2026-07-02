# Visio Technologica Chunk Loading Adoption Guide

This guide describes how to rebuild `visio-technologica` chunk loading so it becomes more fluid, easier to debug, and closer to the architecture in:

- `/Users/juliuswenk/Desktop/KD/borrowed-senses/chunk-system-codex-cube-landscape-demo`

The goal is **not** to invent a new chunk system. The goal is to **reuse as much of the chunk-system demo code as possible** and adapt `visio-technologica` to it in small, testable steps.

---

## Core strategy

### What exists right now

`src/lib/experiences/visio-technologica/scene.ts` currently does all of this in one file:

- loads starter tiles
- derives tile placement from loaded GLBs
- computes a camera focus point
- decides which tiles to load with logical-grid radius rules
- loads/unloads GLBs directly
- tracks overlay/debug state

That works as a prototype, but it mixes together:

1. **chunk math**
2. **view / horizon selection**
3. **streaming lifecycle**
4. **actual GLB loading**
5. **experience-specific scene setup**

### What the demo repo already gives you

From the chunk-system demo, the most reusable pieces are:

- `src/lib/chunk-core/roomSegmentation.ts`
- `src/lib/chunk-core/subchunkRaster.ts`
- `src/lib/chunk-horizon/viewChunkHorizon.ts`
- `src/lib/chunk-horizon/viewChunkHorizon.test.ts`
- the incremental demo philosophy in:
  - `src/routes/chunk-runtime-demo/ChunkRuntimeDemo.svelte`
  - `src/routes/flying-chunk-horizon-demo/FlyingChunkHorizonDemo.svelte`

### The recommended target architecture

Use this layering in `neural-flight-template` too:

1. **chunk-core**
   - pure coordinate math
   - no Three.js scene logic
2. **chunk-horizon**
   - pure visible-horizon selection
   - no loading logic
3. **visio tile adapter**
   - converts Visio tile metadata into chunk addresses
4. **visio chunk runtime**
   - handles loaded/loading/unloaded states
   - schedules chunk creation/removal
5. **visio scene integration**
   - plugs runtime into `scene.ts`

That is the shortest path to “fluid” loading without rewriting everything from scratch.

---

## Important observation about the current Visio code

The current file contains a likely red flag:

- `WORLD_TILE_SPACING_SCALE = 0`

That means tile placement is currently being derived in a fragile way, and the system is still compensating with custom focus-point logic.

Instead of trying to keep polishing that custom logic, this guide recommends:

- stop using nearest-loaded-tile as the main chunk-selection strategy
- switch to explicit chunk coordinates from world position
- use the chunk-system demo's coordinate and horizon logic as the source of truth

---

## Minimal-rewrite principle

When in doubt, prefer this order:

1. **copy pure modules first** from the chunk demo
2. **prove them in small test pages**
3. **adapt Visio metadata to those modules**
4. **replace only the chunk selection and streaming parts** in `scene.ts`
5. keep:
   - experience manifest
   - sky / camera setup
   - keyboard controls
   - GLTF loader utility
   - existing tile metadata file, if possible

---

## Recommended implementation phases

Build this up in **six phases**.

---

# Phase 1 — Copy the reusable chunk libraries into this repo

## Goal

Bring the demo's proven, renderer-free chunk code into this project first.

## Files to copy from the demo repo

From:
`/Users/juliuswenk/Desktop/KD/borrowed-senses/chunk-system-codex-cube-landscape-demo/src/lib/`

Copy these folders into this repo:

- `chunk-core`
- `chunk-horizon`

Recommended destination:

- `src/lib/chunk-core/`
- `src/lib/chunk-horizon/`

Also consider adding a small barrel file if useful:

- `src/lib/chunking/index.ts`

But do not restructure the imported demo code unless necessary for this repo's import style.

## Why this first

These modules are already separated from Three.js runtime code and are the safest parts to reuse with minimal rewrite.

## Success criteria

- files compile in this repo
- `viewChunkHorizon.test.ts` can run or at least type-check
- no behavior changes in `visio-technologica` yet

## Coding agent prompt

```text
Copy the reusable renderer-free chunk modules from `/Users/juliuswenk/Desktop/KD/borrowed-senses/chunk-system-codex-cube-landscape-demo/src/lib/` into this project with minimal modification. Specifically bring over:
- `chunk-core/*`
- `chunk-horizon/*`

Place them under:
- `src/lib/chunk-core/`
- `src/lib/chunk-horizon/`

Requirements:
- preserve the existing code structure as much as possible
- keep TypeScript strict
- do not introduce `any`
- only make import-path adjustments required for this repo
- do not integrate with Visio yet
- after editing, run `bunx svelte-check --threshold warning` and report any issues related to the copied files
```

---

# Phase 2 — Build a first testing site: static chunk grid logic only

## Goal

Prove that the chunk math works in this project before touching real tiles.

## What to build

Create a lab page that visualizes a simple chunk grid, similar in spirit to the demo's `chunk-runtime-demo`.

Recommended route:

- `src/routes/lab/visio-chunk-grid/+page.svelte`

This page should:

- import `createCenteredChunkGridCoordinates`
- import `createKeyedChunkBounds`
- render chunk boxes or debug markers
- use fixed chunk dimensions
- show labels or a panel with current chunk keys

Do **not** load GLBs yet.

## Why this matters

If this page is wrong, your world chunking will also be wrong. Fix chunk math here first.

## Suggested initial settings

For Visio, start with a flat grid assumption:

- meaningful axes: `x` and `z`
- keep `yAxisChunkCount = 1`
- use a constant chunk size such as:
  - width: `1`
  - depth: `1`
  - height: `64`

At this stage, these are **logical debug units**, not final world meters.

## Success criteria

- the page renders a stable grid
- chunk coordinates are easy to inspect
- changing counts or chunk size updates visuals predictably

## Coding agent prompt

```text
Create a new lab testing page at `src/routes/lab/visio-chunk-grid/+page.svelte` that demonstrates the copied chunk-core logic inside this repo.

Requirements:
- use `src/lib/chunk-core`
- do not use actual Visio GLB tiles yet
- render a simple static chunk grid visualization in Three.js or reuse an existing lightweight room/runtime pattern already in this project
- keep the demo focused on chunk coordinate logic only
- include a small on-screen debug readout for chunk dimensions and visible chunk keys
- keep types explicit
- do not add new dependencies

The purpose of this page is to validate the chunk coordinate system before moving on to horizon-based loading.
```

---

# Phase 3 — Build a second testing site: moving observer + horizon selection

## Goal

Prove that visible chunk selection follows the camera smoothly.

## What to build

Create a second lab page inspired by:

- `flying-chunk-horizon-demo/FlyingChunkHorizonDemo.svelte`

Recommended route:

- `src/routes/lab/visio-chunk-horizon/+page.svelte`

This page should:

- move a camera through a debug world
- call `createChunkViewHorizon(...)`
- show:
  - current observer chunk
  - visible chunk set
  - maybe fade values or colors
- update continuously while moving

Use cheap geometry only:

- wireframe boxes
- flat quads
- simple cubes

## Why this matters

This replaces the custom Visio logic that currently uses:

- projected focus plane
- nearest loaded tile
- logical tile radius around that tile

The new truth should be:

- observer world position
- chunk dimensions
- view distance
- camera basis vectors
- horizon result

## Success criteria

- moving forward changes the current chunk predictably
- chunks behind the camera disappear from the horizon
- no GLB loading is involved yet

## Coding agent prompt

```text
Create a second lab testing page at `src/routes/lab/visio-chunk-horizon/+page.svelte` that adapts the behavior of the chunk-system demo's flying horizon page to this repo.

Requirements:
- reuse `src/lib/chunk-core` and `src/lib/chunk-horizon`
- keep the implementation as close as practical to the original demo architecture
- use simple placeholder visuals only
- show the observer chunk key and the currently selected horizon chunk keys
- support camera movement so I can verify the horizon updates smoothly
- keep this isolated from `visio-technologica`
- no GLB loading yet
- no new dependencies

The purpose is to verify that horizon selection is a better basis for streaming than the current focus-point logic in `src/lib/experiences/visio-technologica/scene.ts`.
```

---

# Phase 4 — Build a third testing site: Visio tile metadata mapped onto chunk addresses

## Goal

Prove that the real Visio tile metadata can be expressed as chunk data before loading real models.

## What to build

Create a small adapter layer that converts `tile-metadata.ts` into chunk-friendly entries.

Recommended new files:

- `src/lib/experiences/visio-technologica/chunking/visioTileChunkManifest.ts`
- `src/lib/experiences/visio-technologica/chunking/visioTileChunkMath.ts`

## What the adapter should do

Take the data from `tile-metadata.ts` and derive:

- a stable chunk coordinate per tile
- a stable chunk key per tile
- a world origin or center for that tile/chunk
- a lookup from chunk key -> tile metadata

For Visio, each existing tile GLB can initially map to **one chunk**.

That means the first useful model is:

- 1 GLB tile file = 1 chunk

Do **not** group multiple GLBs into one chunk yet. Start with one-to-one mapping.

## Very important rule

Do not derive chunk selection from loaded GLB bounds anymore.

Instead derive chunk placement from **metadata-first** rules.

That means:

- the chunk coordinate should come from the logical tile grid
- not from starter tiles being loaded in the scene
- not from the world bounds of already-loaded meshes

## How to choose chunk coordinates

You already have metadata like:

- `center.x`
- `center.y`
- logical `column`
- logical `row`

Recommended first mapping:

- world `x` ← logical `column`
- world `z` ← logical `row`
- world `y` = `0`

Then choose chunk dimensions:

- width: `1`
- depth: `1`
- height: `1`

This makes the first manifest purely logical and easy to test.

Later, when integrating with real GLBs, you can multiply by a configurable world scale:

- `TILE_WORLD_SIZE`

## Testing page

Create a third lab page:

- `src/routes/lab/visio-tile-chunk-manifest/+page.svelte`

It should:

- render one colored proxy tile per Visio metadata entry
- position proxies from the new manifest adapter
- highlight which proxies belong to the current chunk horizon
- show the mapping between:
  - tile id
  - fileName
  - chunk key

## Success criteria

- all Visio tiles appear in a consistent grid
- moving the camera highlights visible chunk proxies correctly
- the visible set changes smoothly
- no actual GLB models are loaded yet

## Coding agent prompt

```text
Create a metadata-first Visio chunk adapter and a new lab page that visualizes it without loading real GLBs.

Add new files under:
- `src/lib/experiences/visio-technologica/chunking/`

Recommended responsibilities:
- convert `tile-metadata.ts` entries into stable chunk coordinates and chunk keys
- provide world positions derived from metadata, not from loaded GLB bounds
- expose lookups that a future streaming runtime can use

Also create a testing page at:
- `src/routes/lab/visio-tile-chunk-manifest/+page.svelte`

Requirements:
- render simple proxies instead of loading actual tiles
- highlight which chunk proxies are inside the current `createChunkViewHorizon(...)` result
- keep the implementation close to the chunk-system demo philosophy
- no new dependencies
- explicit types only

The purpose is to prove that the Visio tile world can be driven by metadata-first chunk logic before integrating the real GLB assets.
```

---

# Phase 5 — Build a fourth testing site: stream lightweight placeholder content per chunk

## Goal

Add actual load/unload lifecycle without risking expensive GLB logic yet.

## What to build

Create a small Visio-specific chunk runtime that tracks chunk state.

Recommended new file(s):

- `src/lib/experiences/visio-technologica/chunking/visioChunkRuntime.ts`
- maybe `src/lib/experiences/visio-technologica/chunking/visioChunkTypes.ts`

## Runtime responsibilities

This runtime should:

- receive the current horizon chunk keys
- diff them against active chunk keys
- mark chunks as:
  - `unloaded`
  - `loading`
  - `loaded`
  - `unloading`
- create/remove **placeholder scene objects** only
- optionally throttle how many chunk changes happen per frame or turn

At this stage, chunk loading should create something cheap like:

- a colored plane
- a box
- a group with text/debug marker

Still do **not** use the real Visio GLBs.

## Why this phase exists

If your runtime logic is unstable with proxies, it will be worse with GLBs.

## Suggested runtime design

Try to keep this split:

- `chunk-core`: pure coordinate conversion
- `chunk-horizon`: pure visible selection
- `visioChunkRuntime`: state diffing and load queueing
- route page: actual placeholder scene object creation

If practical, make the runtime reusable by accepting callbacks such as:

- `loadChunk(chunkKey)`
- `unloadChunk(chunkKey)`

## Testing page

Create:

- `src/routes/lab/visio-chunk-runtime/+page.svelte`

This should behave like the real future streaming system, but with placeholders.

## Success criteria

- entering a new area loads nearby placeholder chunks
- leaving an area unloads old ones
- loads happen smoothly, not all at once
- the currently active chunk set is inspectable in a panel

## Coding agent prompt

```text
Create a Visio-specific chunk runtime that uses the metadata-first chunk manifest and the copied chunk-horizon logic to stream placeholder content.

Add the runtime under:
- `src/lib/experiences/visio-technologica/chunking/`

Also create a test page at:
- `src/routes/lab/visio-chunk-runtime/+page.svelte`

Requirements:
- do not load real GLB tiles yet
- use placeholder objects for chunk content
- runtime should diff horizon chunk keys against active chunk keys
- support explicit chunk states like unloaded/loading/loaded/unloading
- keep loads incremental so movement feels fluid
- keep code modular so the same runtime can later load real Visio tile GLBs
- avoid `any`
- no new dependencies

The purpose is to validate the streaming lifecycle separately from real asset cost.
```

---

# Phase 6 — Integrate real Visio GLB tiles into the tested chunk runtime

## Goal

Swap placeholder chunk content for the actual tile GLBs.

## What to reuse from current Visio code

Keep and reuse where possible:

- `loadGLTF` usage
- mesh/material disposal helpers
- `prepareWorldModel(...)`
- debug overlay ideas
- keyboard camera controls
- general scene setup

## What to stop relying on

Avoid keeping these as the main chunk-selection mechanism:

- `getChunkFocusPoint(...)`
- `getNearestChunkToFocus(...)`
- logical-distance-only loading around the nearest loaded tile
- placement derived from starter-world bounds

Those pieces can remain temporarily during migration, but the final runtime should not depend on them.

## New final loading flow

The final streaming flow should look like this:

1. camera/world position changes
2. current chunk coordinate is computed from world position
3. visible horizon chunk keys are computed via `createChunkViewHorizon(...)`
4. Visio runtime diffs desired vs active chunk keys
5. runtime schedules a small number of chunk loads/unloads per turn
6. loading a chunk loads the tile GLB(s) for that chunk
7. world placement comes from metadata-first chunk positions
8. unload disposes the GLB scene objects cleanly

## Recommended migration style

Do this in two passes.

### Pass A — Add new chunk runtime alongside old logic

Temporarily keep the old scene behavior intact while adding:

- new chunk manifest adapter
- new chunk runtime
- real GLB loading path behind a flag or isolated branch in `scene.ts`

### Pass B — Remove old custom streaming logic

Once the new runtime is proven, remove or retire:

- focus-plane driven selection
- nearest-loaded-tile selection
- starter-tile-based spacing heuristics for streaming decisions

## Suggested new files for final integration

- `src/lib/experiences/visio-technologica/chunking/visioTileChunkManifest.ts`
- `src/lib/experiences/visio-technologica/chunking/visioChunkRuntime.ts`
- `src/lib/experiences/visio-technologica/chunking/visioChunkSceneAdapter.ts`
- optional config file:
  - `src/lib/experiences/visio-technologica/chunking/visioChunkConfig.ts`

## Suggested scene changes

`src/lib/experiences/visio-technologica/scene.ts` should eventually become thinner and focus on:

- camera and sky
- world root group
- debug overlay
- creating the chunk runtime
- forwarding camera pose into the runtime each tick
- disposing runtime on teardown

## Success criteria

- real GLB tiles load in front of movement smoothly
- far tiles unload cleanly
- moving through the world no longer depends on the starter-tile cluster
- chunk behavior can be debugged from chunk keys, not guessed from mesh bounds

## Coding agent prompt

```text
Integrate the tested Visio chunk runtime into `src/lib/experiences/visio-technologica/scene.ts` so that real GLB tile assets are streamed by metadata-first chunk coordinates and horizon selection.

Requirements:
- reuse as much as possible from the copied chunk-system modules
- reuse as much as practical from the existing Visio GLTF loading and disposal helpers
- keep chunk placement metadata-first rather than derived from starter tile bounds
- keep changes incremental and explicit
- if helpful, preserve old logic temporarily behind clearly isolated code during migration, but aim for the new runtime to become the primary path
- keep TypeScript strict
- do not add new dependencies
- after editing, run `bunx svelte-check --threshold warning` and `bunx biome check --write` on touched files

Return:
- which old streaming functions are now obsolete
- which parts were preserved
- what manual checks I should perform in the browser/VR scene
```

---

# Suggested file plan

This is the cleanest low-risk file plan.

## Copy directly from demo repo

- `src/lib/chunk-core/index.ts`
- `src/lib/chunk-core/roomSegmentation.ts`
- `src/lib/chunk-core/subchunkRaster.ts`
- `src/lib/chunk-core/README.md`
- `src/lib/chunk-horizon/index.ts`
- `src/lib/chunk-horizon/viewChunkHorizon.ts`
- `src/lib/chunk-horizon/viewChunkHorizon.test.ts`
- `src/lib/chunk-horizon/README.md`

## Add for Visio adoption

- `src/lib/experiences/visio-technologica/chunking/visioChunkConfig.ts`
- `src/lib/experiences/visio-technologica/chunking/visioTileChunkManifest.ts`
- `src/lib/experiences/visio-technologica/chunking/visioChunkRuntime.ts`
- `src/lib/experiences/visio-technologica/chunking/visioChunkSceneAdapter.ts`

## Add lab testing pages

- `src/routes/lab/visio-chunk-grid/+page.svelte`
- `src/routes/lab/visio-chunk-horizon/+page.svelte`
- `src/routes/lab/visio-tile-chunk-manifest/+page.svelte`
- `src/routes/lab/visio-chunk-runtime/+page.svelte`

---

# How to think about chunk size for Visio

Start simple.

## First working assumption

Treat each tile as one chunk:

- one tile file = one chunk

That means your first stable mapping can be:

- chunk coordinate `x` = logical column
- chunk coordinate `z` = logical row
- chunk coordinate `y` = 0

Then expose a config constant for world scaling, for example:

- `TILE_WORLD_SIZE`

The tile world position becomes:

- `worldX = chunkCoordinate.x * TILE_WORLD_SIZE`
- `worldZ = chunkCoordinate.z * TILE_WORLD_SIZE`

This is much easier to debug than inferring placement from starter GLB bounds.

## Only optimize later

Do **not** start by grouping several tiles into larger chunks.

Once one-tile-per-chunk works, you can later consider:

- multi-tile chunk groups
- preload radius vs visible radius
- chunk pooling
- GLB caching
- background loading prioritization

---

# How to keep loading fluid

Fluidity comes from runtime behavior more than from math alone.

## Recommended rules

### 1. Keep chunk computation pure

`createChunkViewHorizon(...)` should stay a query, not a loader.

### 2. Diff desired vs active sets

Every update should compute:

- desired chunk keys
- currently active chunk keys
- chunks to load
- chunks to unload

### 3. Limit work per tick/turn

Do not load all missing chunks in one go.

Start with a small budget, for example:

- `1` to `2` chunk loads per turn
- unloads can usually happen immediately

### 4. Separate visible radius from retention radius

To reduce popping:

- keep chunks slightly longer than they are visible
- equivalent idea to current load/unload hysteresis, but based on horizon/runtime state

### 5. Cache if needed after correctness

Only after the system works, consider reusing already loaded GLBs or parsed scenes.

Correctness first, then caching.

---

# Manual validation checklist for each phase

Use this after every phase.

## Phase 2 checklist

- grid coordinates are stable
- origin is understandable
- changing chunk counts behaves predictably

## Phase 3 checklist

- current observer chunk matches camera movement
- horizon updates continuously
- behind-camera chunks are excluded

## Phase 4 checklist

- every Visio tile gets a deterministic chunk key
- proxy positions match the expected tile layout
- no dependency on loaded GLB bounds exists

## Phase 5 checklist

- placeholder chunks load/unload correctly
- runtime state matches what is visible
- movement does not cause huge spikes or all-at-once rebuilds

## Phase 6 checklist

- real GLB tiles appear at the expected metadata positions
- chunk transitions feel smooth
- disposed chunks do not remain in the scene graph
- no new GLTF or Three.js errors appear
- VR frame pacing is better than with the old approach

---

# What to remove or retire after migration

Once the new runtime works, review whether these old `scene.ts` functions can be removed or heavily simplified:

- `getChunkFocusPoint(...)`
- `updateChunkFocus(...)`
- `getNearestChunkToFocus(...)`
- `getLogicalTileDistance(...)` as the main streaming selector
- `getTileWorldStep(...)` for chunk selection purposes
- `getStarterGridAnchor(...)` as a dependency for streaming decisions
- starter-bounds-derived placement heuristics for deciding what should load next

Some placement helpers may still be reusable for final visual alignment, but they should no longer decide chunk ownership or visibility.

---

# Recommended working order

If you want the safest sequence, do it exactly like this:

1. copy `chunk-core`
2. copy `chunk-horizon`
3. build `lab/visio-chunk-grid`
4. build `lab/visio-chunk-horizon`
5. build Visio metadata-first chunk manifest
6. build `lab/visio-tile-chunk-manifest`
7. build placeholder runtime
8. build `lab/visio-chunk-runtime`
9. integrate real GLBs into Visio
10. remove old custom chunk-selection logic

Do not skip directly from step 2 to final VR integration.

---

# One master prompt for the whole migration

If you want to drive this as a longer coding-agent task, use this prompt:

```text
I want to migrate `src/lib/experiences/visio-technologica/` to a more fluid chunk loading system using as much code as possible from `/Users/juliuswenk/Desktop/KD/borrowed-senses/chunk-system-codex-cube-landscape-demo/`.

Follow this exact approach:
1. copy the reusable renderer-free chunk libraries first
2. create small lab/testing routes that prove the logic before using real Visio tiles
3. adapt `tile-metadata.ts` into a metadata-first chunk manifest
4. create a Visio chunk runtime with explicit load/unload states using placeholder chunk content first
5. only then integrate the actual GLB tile assets into `scene.ts`
6. keep rewrites minimal and prefer reusing demo code over inventing new chunk math

Constraints:
- explicit TypeScript types only
- no `any`
- no new dependencies unless strictly necessary
- do not jump straight to final integration
- after each phase, summarize what changed, what was validated, and what the next phase should be

Start with Phase 1 only.
```

---

# Final recommendation

The most important architectural shift is this:

**Make chunk identity come from metadata and chunk coordinates first, not from whatever meshes happen to be loaded right now.**

That single change will make the system:

- easier to reason about
- easier to debug
- closer to the chunk-system demo
- less dependent on starter-tile bootstrapping
- much easier to optimize later
