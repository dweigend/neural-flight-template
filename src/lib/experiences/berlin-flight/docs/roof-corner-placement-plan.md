# Berlin Flight Roof Corner Placement Plan

## Goal

Build a Berlin-only procedural placement component that reads streamed OSM building geometry, extracts roof-corner candidate points, filters them, and exposes stable world-space shadow-origin positions for later object placement.

This phase does **not** place objects yet. It only produces and debugs point positions.

## Confirmed constraints

- Berlin runtime remains `Three.js + WebXR`
- Photorealistic city rendering continues to come from streamed Cesium/Google 3D data
- OSM Buildings are available as an additional streamed source
- Placement runs incrementally around the player
- Candidate corners come from polygon vertices with the highest up-axis value
- Keep the highest `N` corners per building
- Apply a minimum required distance filter between accepted points
- Include debug tooling
- Avoid god files: target max `200 LOC` per file
- Prefer early-exit programming style
- Use explicit TypeScript types
- Keep config values out of inline literals

## Existing integration points

This work should attach to the existing Berlin experience under:

- [scene.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/scene.ts)
- [types.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/types.ts)
- [runtime/tiles-runtime.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts)
- [debug/overlay.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/debug/overlay.ts)

`scene.ts` should stay orchestration-only. The placement pipeline should live in small Berlin-local modules.

## Recommended module split

Create a small placement subsystem under:

- `src/lib/experiences/berlin-flight/placement/types.ts`
- `src/lib/experiences/berlin-flight/placement/config.ts`
- `src/lib/experiences/berlin-flight/placement/osm-corner-source.ts`
- `src/lib/experiences/berlin-flight/placement/corner-extractor.ts`
- `src/lib/experiences/berlin-flight/placement/corner-filter.ts`
- `src/lib/experiences/berlin-flight/placement/corner-registry.ts`
- `src/lib/experiences/berlin-flight/placement/debug-markers.ts`
- `src/lib/experiences/berlin-flight/placement/controller.ts`

Keep each file under `200 LOC`. If one file grows beyond that, split by responsibility instead of adding a utility dump.

## Pipeline overview

The intended phase-1 pipeline is:

1. OSM building source discovery around the player
2. Per-building corner extraction
3. Candidate scoring / filtering seam
4. Global spacing filter
5. Stable accepted-point registry
6. Debug snapshot + marker rendering

Later heatmap logic should plug into step 3 without changing the extractor.

## Phase 1 - Define contracts and config

### Objective

Lock the data model and tuning surface before wiring runtime behavior.

### Deliverables

- Typed models for:
  - building source records
  - raw roof-corner candidates
  - accepted shadow-origin points
  - placement debug stats
- Berlin placement config values for:
  - scan radius
  - movement threshold before recompute
  - max corners per building
  - min required distance
  - max buildings or candidates processed per tick
  - debug marker defaults

### Checks

- No `any`
- No file over `200 LOC`
- Config values live in config, not in runtime loops
- Types separate raw extraction data from accepted placement data

### Coding agent prompt

```text
Add a Berlin roof-corner placement contract for streamed OSM Buildings.

Constraints:
- Work only under src/lib/experiences/berlin-flight/
- No god files; keep every new file under 200 LOC
- Use early-exit style
- No any
- Put tunables in config, not inline literals

Tasks:
1. Add explicit placement types for:
   - building candidate source records
   - roof corner candidates
   - accepted shadow-origin points
   - debug counters / snapshot
2. Add Berlin placement config values for:
   - max corners per building
   - min required distance
   - scan/update radius
   - movement threshold before recompute
   - max work budget per tick
   - debug marker defaults
3. Do not wire runtime behavior yet.

Return:
- file list
- short explanation of each type/config
- note any naming decisions
```

## Phase 2 - Find the OSM building integration point

### Objective

Identify the narrowest runtime hook where streamed OSM building geometry is available for inspection.

### Deliverables

- Exact integration point for reading OSM building meshes
- Confirmed metadata available per building
- Confirmed coordinate-space assumptions
- Stable building id strategy, or a deterministic fallback

### Checks

- Confirm whether geometry is footprint-driven or only triangulated mesh data
- Confirm whether vertices are already in Berlin local/world space
- Confirm whether world `y` is the up axis in the transformed runtime
- Confirm whether chunk/building unload events can be observed

### Coding agent prompt

```text
Inspect the Berlin/OSM runtime and locate the narrowest integration point for reading streamed OSM building geometry.

Constraints:
- Do not add new behavior yet
- No broad refactors
- Keep notes local to berlin-flight docs or comments

Tasks:
1. Find where OSM Buildings are instantiated or attached to the scene.
2. Determine what geometry and metadata are available per building mesh.
3. Confirm the world-space up axis and whether transformed vertices can be read directly.
4. Identify a stable per-building key if available; otherwise propose a deterministic fallback.

Return:
- integration point
- available metadata
- risks/gaps
- exact files involved
```

## Phase 3 - Build the raw corner extractor

### Objective

Given one building mesh or source record, derive roof-corner candidate positions.

### Deliverables

- A pure extractor module with no scene mutation
- Per-building vertex scan
- Highest-up-axis filtering
- Keep top `N` corners per building
- Same-building epsilon dedupe

### Checks

- Early-exit on empty geometry
- Early-exit on missing position attributes
- Avoid unnecessary allocations in hot paths
- Return typed world-space positions
- Handle transformed meshes correctly

### Coding agent prompt

```text
Implement a pure building-corner extractor for Berlin OSM building meshes.

Constraints:
- New files under 200 LOC
- Early exits for invalid geometry
- No scene mutation in the extractor
- No any
- Work in world space if the mesh is already transformed; otherwise apply the correct transform explicitly

Rules:
- Candidate corners are polygon vertices with the highest up-axis value
- Keep the highest N corners per building
- Deduplicate near-identical same-building corners with a small epsilon
- Return typed results with building id and world position

Do not connect this to the render loop yet.

Return:
- extractor API
- assumptions about geometry format
- edge cases handled
```

## Phase 4 - Add spacing filter and stable registry

### Objective

Turn per-building candidates into stable scene-wide shadow-origin points.

### Deliverables

- Global minimum-distance filter
- Accepted-point registry
- Deterministic ordering before filtering
- Stale-point removal when buildings unload or move out of scope

### Recommended ordering

Before spacing is applied, sort candidates deterministically:

1. higher elevation first
2. then stable building id
3. then stable corner index or world-position tie-breaker

This keeps accepted results stable and reduces visual flicker.

### Checks

- Same input should yield the same accepted set
- No full-scene rescan every frame
- Registry can remove stale buildings and stale points
- Snapshot API is available for debug and later object placement

### Coding agent prompt

```text
Implement a stable Berlin roof-corner registry and min-distance filter.

Constraints:
- No god files; each file under 200 LOC
- Early exits
- No any
- No full recompute every frame unless explicitly required

Tasks:
1. Add a registry for accepted shadow-origin points.
2. Add deterministic ordering before filtering.
3. Enforce global minimum spacing between accepted points.
4. Support stale-point removal when source buildings disappear or leave range.
5. Expose a snapshot API for debug overlay and future object placement.

Do not add object spawning.

Return:
- registry API
- update triggers
- how stability/flicker is controlled
```

## Phase 5 - Add the incremental runtime controller

### Objective

Wire the placement pipeline into `berlin-flight` without pushing implementation into `scene.ts`.

### Deliverables

- A Berlin-owned placement controller
- Small additions to `BerlinState`
- `setup` / `tick` / `dispose` lifecycle integration
- Incremental scanning around the player
- Per-tick work budget

### Runtime rules

- Scan only when movement or source changes justify work
- Cache processed buildings
- Process nearby data incrementally
- Expose read-only accepted-point snapshots

### Checks

- `scene.ts` stays orchestration-only
- No placement logic sprawled across unrelated files
- Disposal clears caches, debug markers, and references

### Coding agent prompt

```text
Wire the Berlin roof-corner placement pipeline into berlin-flight as a small owned subsystem.

Constraints:
- Keep scene.ts as orchestration, not implementation
- No file over 200 LOC
- Early exits
- No any
- Respect existing setup/tick/dispose patterns in berlin-flight

Tasks:
1. Add a placement controller owned by BerlinState.
2. Create it in setup, update it in tick, dispose it in dispose.
3. Trigger incremental scans around the player instead of full rescans.
4. Add a per-tick work budget and movement threshold.
5. Expose accepted point snapshots for future object placement.

Return:
- changed files
- BerlinState additions
- lifecycle summary
```

## Phase 6 - Add debug markers and overlay support

### Objective

Make accepted points inspectable in VR before the future object placer exists.

### Deliverables

- Marker rendering for accepted points
- Optional support for rejected/raw candidates if cheap enough
- Debug overlay counters and timings

### Suggested overlay fields

- scanned buildings
- scanned candidates
- accepted points
- rejected by spacing
- last update duration
- active debug marker count

### Checks

- Debug remains optional and lazy-created
- Minimal overhead when disabled
- Prefer `InstancedMesh` or another lightweight marker strategy
- No one-mesh-per-point pattern if counts can grow

### Coding agent prompt

```text
Add VR-debug tooling for Berlin roof-corner placement.

Constraints:
- Keep debug optional and lazy-created
- No file over 200 LOC
- Early exits
- No any
- Avoid expensive per-point object creation if counts rise

Tasks:
1. Render accepted shadow-origin points as lightweight debug markers.
2. Optionally support a second marker state for rejected candidates if cheap and clean.
3. Extend the Berlin debug overlay with placement counters and timing.
4. Ensure disabling debug removes runtime overhead as much as possible.

Return:
- marker strategy
- overlay fields added
- any performance caveats
```

## Phase 7 - Validate in Berlin

### Objective

Verify the geometry assumptions and runtime behavior before building object placement.

### Validation route

Test at least:

- one sparse block
- one dense urban block
- one clearly tall building

### Checks

- Points sit on roof corners, not ground level
- Tall buildings contribute the expected top-corner set
- Minimum-distance filtering reduces clutter
- Point selection stays stable while circling a building
- No obvious leaks when flying away and returning
- Formatting and types still pass project checks

### Commands

```bash
bunx biome check --write .
bunx svelte-check --threshold warning
```

### Coding agent prompt

```text
Validate the Berlin roof-corner placement subsystem.

Tasks:
1. Run biome and svelte-check.
2. Verify accepted points in at least three Berlin scenarios:
   - sparse block
   - dense urban block
   - one clearly tall building
3. Record any geometry mismatches:
   - wrong up-axis
   - duplicate corners
   - unstable point selection
   - spacing filter artifacts
4. Propose the smallest follow-up fixes only where validation shows a real issue.

Return:
- validation summary
- commands run
- issues found
- minimal follow-up list
```

## Phase 8 - Prepare for the later heatmap phase

### Objective

Leave one clean extension point for density logic without overbuilding phase 1.

### Deliverables

- One score/filter seam between extraction and final acceptance
- Short local doc note describing the pipeline
- No heatmap implementation yet

### Checks

- Current behavior remains unchanged
- Future density logic can plug in without rewriting extraction
- No speculative abstraction beyond one clear seam

### Coding agent prompt

```text
Prepare the Berlin roof-corner pipeline for a later heatmap density phase without over-engineering it.

Constraints:
- Add only one clear extension point
- Do not implement heatmap logic now
- No file over 200 LOC
- Early exits
- No any

Tasks:
1. Introduce a minimal scoring/filter seam between corner extraction and final acceptance.
2. Keep current behavior equivalent to today's rules.
3. Add a short local doc note describing the pipeline and extension point.

Return:
- extension seam
- why it is sufficient
- what was intentionally deferred
```

## Key risks to resolve early

1. OSM runtime may expose triangulated roof meshes instead of original footprint vertices.
2. Stable building ids may be missing or inconsistent across streaming boundaries.
3. Decorative roof peaks may dominate the "highest vertices" result on complex geometry.
4. Full rescans may be too expensive unless chunk/building caching is strict.

## Recommended execution order

1. Phase 1 - contracts and config
2. Phase 2 - inspect OSM integration point
3. Phase 3 - extractor
4. Phase 4 - registry and spacing
5. Phase 5 - runtime controller
6. Phase 6 - debug tooling
7. Phase 7 - validation
8. Phase 8 - future heatmap seam

## Practical note

The first real implementation step should be Phase 2. If the OSM source exposes clean footprint vertices, the rest of the pipeline is straightforward. If it only exposes triangulated render meshes, the extractor design needs to be tighter before writing the runtime controller.

## Phase 2 inspection notes

Current Berlin runtime does not instantiate a separate OSM Buildings source yet.
It only loads one streamed 3D Tiles source through `TilesRuntimeAdapter` and
attaches the loaded tile scene into `state.tilesGroup`.

Narrowest existing mesh hook:

- `TilesRuntimeAdapter.handleLoadModel()` in `runtime/tiles-runtime.ts`
- called from the `load-model` event wired in `runtime/tiles-renderer-config.ts`
- receives `{ scene, tile, url }` for each streamed tile content payload

What is available there today:

- `scene`: the loaded tile content root `THREE.Object3D`
- `tile`: 3D Tiles tile record with `content.uri`, `transform`, `boundingVolume`,
  `geometricError`, `extensions`, `extras`, traversal state, and parent/child links
- traversed child meshes expose standard `THREE.BufferGeometry` attributes only
- current app code already proves mesh inspection is viable through
  `BerlinTileMeshRegistry.trackTileScene(root)`

Coordinate-space findings:

- `loadTilesWhenConfigured()` applies `getECEFToLocalMatrix(BERLIN_MITTE_ORIGIN)`
  to `tiles.group`
- local world frame is `X = East`, `Y = Up`, `Z = South`, so world `y` is the up axis
- tile content scenes are premultiplied by the tile transform inside
  `3d-tiles-renderer` before `load-model` is emitted
- child mesh `matrixWorld` becomes final Berlin-local world space after the tile scene
  is attached under `tiles.group` and `updateMatrixWorld(true)` runs
- current collision preprocessing already converts local positions to world positions
  with `mesh.matrixWorld`, so transformed vertices can be read directly that way

Metadata / identity findings:

- current Berlin runtime does not register extra glTF metadata plugins
- for generic glTF tile content, no app-level building metadata is surfaced today
- for b3dm / i3dm content, the loader library can attach `featureTable` and
  `batchTable` to the loaded tile scene, but Berlin does not currently read them
- current hook is tile-scene level, not per-building semantic level

Implication for roof-corner placement:

- if the future OSM source yields one mesh per building, `handleLoadModel()` plus
  mesh traversal is enough
- if the future OSM source yields triangulated chunk meshes without per-building ids,
  the extractor will only see render triangles and needs a deterministic fallback key

Recommended deterministic fallback key if no stable building id exists:

1. tile content uri
2. mesh path within the loaded tile scene
3. quantized mesh-local or world-space bounding-box center

This gives a stable source key across rescans of the same loaded content, but not a
guarantee across source dataset revisions.

## Heatmap seam note

Current runtime pipeline is:

1. source discovery
2. per-building corner extraction
3. `applyBerlinCornerCandidateStage(...)`
4. deterministic global spacing filter
5. accepted-point registry

`applyBerlinCornerCandidateStage(...)` is the only planned extension seam for a later
heatmap phase. It currently returns candidates unchanged. Future density logic can
score or drop candidates there before final acceptance without rewriting the
extractor, spacing filter, or registry.
