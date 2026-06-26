# Berlin Flight Roof-Cone Integration Plan

## Goal

Connect the existing roof-point placement pipeline with the cone system so cones originate at accepted high-top points instead of a fixed grid.

Each cone should:

- use the accepted roof/high-point as its tip/origin
- tilt downward so the cone body points below the roof point
- stay within a configurable tilt range where:
  - `0` degrees = straight down
  - `90` degrees = horizontal
- face away from the nearest surrounding mesh geometry
- be skipped entirely when no reliable outward direction can be derived

This phase should produce stable cone placement + orientation data first, then wire rendering and collision to the new cone shape.

## Confirmed decisions

- Preferred ownership: a **separate integration layer** between placement and cone runtime
- Fallback ownership: extend the high-top placement system if the seam proves too awkward
- Outward direction source: **nearest surrounding geometry**
- Failure mode: **skip the cone**

## Why this ownership makes sense

The current roof-point pipeline already does one job well: find stable accepted world-space points.

The current cone runtime also does one job well: render and expose cone volumes.

The new work is neither of those jobs. It needs to:

1. consume accepted roof points
2. inspect nearby mesh geometry around each point
3. solve a reliable downward + outward orientation
4. emit cone descriptors that rendering and collision can both use

That is a separate responsibility. Keeping it Berlin-local as an integration layer is the shortest path that does not contaminate the extractor or the existing cone grid logic.

## Current integration points

- [scene.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/scene.ts)
  - already updates `placementController`, `coneRuntime`, and `collisionController`
- [placement/controller.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/controller.ts)
  - already exposes accepted roof/high-top points
- [placement/types.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/types.ts)
  - already defines accepted point records
- [runtime/cone-grid-runtime.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/cone-grid-runtime.ts)
  - currently owns fixed grid cone creation and instanced rendering
- [runtime/cone-grid-chunk.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/cone-grid-chunk.ts)
  - currently builds vertical cones from fixed `x/z` spacing
- [collision/types.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/collision/types.ts)
  - currently models cones as vertical cylinders/cones
- [collision/vertex-cone-test.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/collision/vertex-cone-test.ts)
  - currently assumes vertical `y`-aligned cones

## Core constraint

The current collision and rendering path assumes cones are vertical. Angled cones are not just a placement tweak. They require the cone descriptor to carry direction/orientation, and the collision test to project vertices onto the cone axis instead of only checking `y`.

So the first useful split is:

1. solve anchored cone descriptors
2. make runtime render those descriptors
3. make collision test those descriptors

## Recommended module split

Add a small Berlin-local integration subsystem:

- `src/lib/experiences/berlin-flight/cone-placement/types.ts`
- `src/lib/experiences/berlin-flight/cone-placement/config.ts`
- `src/lib/experiences/berlin-flight/cone-placement/mesh-neighborhood.ts`
- `src/lib/experiences/berlin-flight/cone-placement/orientation-solver.ts`
- `src/lib/experiences/berlin-flight/cone-placement/cone-source.ts`
- `src/lib/experiences/berlin-flight/cone-placement/controller.ts`

Targeted edits only:

- `placement/types.ts`
- `runtime/cone-grid-runtime.ts`
- `runtime/cone-grid-chunk.ts` or a replacement runtime file if the grid path is retired
- `collision/types.ts`
- `collision/cone-query.ts`
- `collision/vertex-cone-test.ts`
- `scene.ts`

Keep `scene.ts` orchestration-only.

## Pipeline overview

The intended integration pipeline is:

1. accepted roof/high-top points come from `placementController`
2. nearby mesh neighborhood is sampled around each accepted point
3. outward-facing direction is solved from nearby geometry
4. downward tilt is applied within a configured angle range
5. invalid / ambiguous results are dropped
6. stable cone descriptors are cached
7. rendering consumes those descriptors
8. collision consumes the same descriptors

## Phase 1 - Lock the shared cone descriptor

### Objective

Define one cone contract that works for both rendering and collision.

### Deliverables

- Extend or replace the current `BerlinConeVolume` shape with explicit axis data:
  - `tip: THREE.Vector3`
  - `axisDirection: THREE.Vector3`
  - `height: number`
  - `radius: number`
  - `baseCenter: THREE.Vector3`
  - `placementPointId: string`
  - `sourceBuildingId: string`
- Keep axis normalized
- Keep all values in Berlin world space

### Notes

The current `center + height` vertical model is too limited. The lazy fix is to upgrade the shared descriptor once, then reuse it everywhere.

### Checks

- No `any`
- No duplicate cone models for render vs collision
- The descriptor states clearly whether `tip` or `baseCenter` is canonical

## Phase 2 - Add orientation config

### Objective

Move all tilt and neighborhood heuristics into config before writing solver logic.

### Deliverables

- New config values for:
  - minimum tilt from straight down
  - maximum tilt from straight down
  - neighborhood search radius
  - minimum nearby sample count
  - roof clearance epsilon
  - ambiguity threshold for rejecting weak outward vectors
  - max cones processed per tick

### Checks

- No inline magic numbers in solver code
- Tilt semantics use your requested convention:
  - `0` = straight down
  - `90` = horizontal

## Phase 3 - Build the nearby-geometry sampler

### Objective

For one accepted roof point, collect the nearest useful surrounding geometry signal.

### Deliverables

- A pure helper that inspects tracked meshes near a placement point
- Reuse existing tracked tile mesh data instead of building a second mesh registry
- Return a compact neighborhood result, for example:
  - nearest point on nearby geometry
  - vector from roof point toward that geometry
  - sample count
  - distance stats

### Recommended approach

Start simple:

1. prefilter tracked meshes by world bounds
2. scan candidate vertices within a search radius around the roof point
3. keep the nearest surrounding vertex set that is not the roof point itself
4. derive an inward vector from roof point toward that geometry
5. flip it to get the outward-facing horizontal direction

This is good enough for a first pass and reuses data the collision system already has.

### Checks

- Early-exit when no nearby geometry exists
- Ignore samples that are effectively the same point as the roof origin
- Prefer horizontal steering; do not let a mostly vertical sample force nonsense yaw

## Phase 4 - Solve cone orientation

### Objective

Convert the neighborhood signal into a stable downward-facing cone axis.

### Deliverables

- A pure orientation solver:
  - input: accepted point + neighborhood result
  - output: normalized cone axis or `null`
- Axis points away from nearby geometry
- Axis tilts downward by a clamped angle in the `10-80` degree range you described

### Recommended solving rule

1. Start with global down vector `(0, -1, 0)`
2. Compute outward horizontal vector by negating the nearest-geometry direction and flattening to `x/z`
3. Reject if the flattened vector is too small
4. Blend down vector with outward vector using a tilt amount from config
5. Normalize the final vector
6. Reject if the final vector is invalid

### Important detail

Use the accepted roof point as the cone `tip`, not the cone center. The render and collision code can derive `baseCenter = tip + axisDirection * height`.

### Checks

- The axis always points downward
- The axis never exceeds the allowed tilt range
- Ambiguous outward direction returns `null`

## Phase 5 - Build the cone integration controller

### Objective

Turn accepted roof points into a stable set of render/collision-ready cone descriptors.

### Deliverables

- New Berlin-local controller that:
  - reads accepted points from `placementController`
  - reads tracked meshes from `tilesRuntime`
  - computes oriented cones incrementally
  - caches accepted cone descriptors by `pointId`
  - removes cones when source points disappear
- Snapshot API:
  - `getActiveCones(): readonly BerlinConeVolume[]`
  - optional debug snapshot with skipped counts and timings

### Why not extend placement directly

Placement should stay focused on point acceptance. The cone controller depends on mesh-neighborhood heuristics that are specific to this rendering behavior.

### Checks

- No full rebuild every frame
- Recompute only when:
  - accepted points change
  - tracked mesh version changes
  - player movement crosses a meaningful threshold, if needed

## Phase 6 - Adapt the cone runtime to consume descriptors

### Objective

Stop generating cones from the fixed grid and render the oriented descriptors instead.

### Deliverables

- Replace or bypass the current fixed `x/z` chunk generation path
- Build instance matrices from:
  - `tip`
  - `axisDirection`
  - `height`
  - `radius`
- Rotate the Three.js cone geometry so the mesh axis matches the descriptor axis

### Recommended implementation

Do not keep both a grid generator and a roof-point generator unless you still need the grid for comparison. The shortest path is a runtime that consumes external cone descriptors and only owns instancing/visibility.

### Checks

- Cone tip visually sits on the accepted roof point
- Cone base opens downward/outward along the solved axis
- Disposal still clears geometry/material/instances correctly

## Phase 7 - Update collision for oriented cones

### Objective

Make collision use the same oriented cone descriptor instead of the old vertical assumption.

### Deliverables

- Replace `y`-only cone tests with axis-projection math
- Update broad-phase bounds to use a conservative oriented-cone proxy
- Keep the narrow-phase test pure

### Recommended narrow-phase test

For each vertex:

1. compute vector from `tip` to vertex
2. project that vector onto `axisDirection`
3. reject if projected distance is `< 0` or `> height`
4. compute radial distance from the axis
5. allowed radius grows from `0` at tip to `radius` at base
6. vertex is inside if radial distance is within that allowed radius

### Checks

- Old vertical-cone code paths are removed or isolated
- Rendered cone and collision cone agree spatially

## Phase 8 - Add debug proof before visual polish

### Objective

Prove the anchored orientation is correct before tuning visuals.

### Deliverables

- Debug markers for:
  - accepted roof points
  - accepted oriented cones
  - skipped points, if cheap enough
- Overlay counters:
  - accepted points
  - accepted cones
  - skipped by missing neighborhood
  - skipped by ambiguous direction
  - last solve duration

### Validation questions to answer in headset

- Does the cone tip sit exactly on the roof/high point?
- Does the cone base point below the roof point?
- Does the cone avoid facing directly into the nearest wall/roof mass?
- Do ambiguous placements get skipped cleanly instead of producing bad cones?

## Phase 9 - Validate and tighten heuristics

### Objective

Tune the first-pass solver against real Berlin geometry.

### Test route

Check at least:

- flat roofs with parapets
- narrow roof ridges
- dense courtyard blocks
- isolated tall towers

### Checks

- No cones pointing into adjacent walls
- No obvious flip-flopping while circling a building
- Skip rate is acceptable
- Frame time stays inside budget

### Commands

```bash
bunx biome check --write .
bunx svelte-check --threshold warning
```

## First implementation target

Keep the first slice narrow:

1. define oriented cone descriptor
2. sample nearest surrounding geometry from tracked mesh vertices
3. solve outward + downward axis
4. skip ambiguous cases
5. render anchored cones from accepted roof points
6. update collision to match

That is enough to prove the integration end to end without adding a second layer of artistic logic yet.
