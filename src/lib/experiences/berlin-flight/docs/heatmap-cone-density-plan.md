# Berlin Flight Heatmap Cone Density Plan

## Goal

Drive Berlin cone density from a PNG heatmap while reusing the existing roof-corner extraction, placement, and cone orientation pipeline.

This phase should only change how many accepted corner points survive per building. It should not replace the current building scan, cone placement, or orientation logic.

Success criterion:

- given a heatmap, Berlin spawns visibly denser camera clusters in dark districts
- bright areas spawn no cameras
- dark areas can spawn up to 2 cameras per building
- output is deterministic across reloads

## Confirmed decisions

- heatmap input format: PNG
- image orientation: north is up
- placement generation: once on load
- heatmap scope: whole of Berlin
- alignment tolerance: first pass can be visually approximate
- bright areas: truly no cameras
- dark areas: up to 2 cameras per building
- placement/orientation rules: keep using the existing Berlin placement and cone-placement logic

## Existing integration points

The current Berlin pipeline already has the right hook:

1. building source discovery
2. per-building roof-corner extraction
3. candidate stage seam
4. deterministic global spacing filter
5. accepted-point registry
6. cone orientation and volume generation

The heatmap work should attach at step 3, using the existing candidate-stage seam described in [roof-corner-placement-plan.md](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/docs/roof-corner-placement-plan.md).

Relevant files:

- [placement/config.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/config.ts)
- [placement/controller.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/controller.ts)
- [placement/corner-extractor.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/corner-extractor.ts)
- [placement/corner-registry.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/corner-registry.ts)
- [placement/types.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/types.ts)
- [geo/coordinates.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/geo/coordinates.ts)
- [geo/berlin-mitte-origin.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/geo/berlin-mitte-origin.ts)

## Asset contract

Store the heatmap assets under:

- `src/lib/experiences/berlin-flight/heatmaps/`

Recommended first asset pair:

- `camera-density.berlin.png`
- `camera-density.berlin.json`

The JSON sidecar should define geographic bounds for the whole image:

```json
{
  "north": 52.675,
  "south": 52.338,
  "west": 13.088,
  "east": 13.761
}
```

These are rough Berlin bounds and are good enough for first-pass visual alignment.

## Mapping rules

Use the simplest deterministic mapping:

1. read PNG luminance
2. normalize to `0..1`
3. invert it so `density = 1 - luminance`
4. map density to per-building allowed camera count:
   - `density < 0.34` -> `0`
   - `0.34 <= density < 0.67` -> `1`
   - `density >= 0.67` -> `2`

Notes:

- do not use probabilistic sampling
- bright areas should produce no accepted points
- dark areas should allow up to 2 accepted points for the building, subject to the existing spacing and candidate availability rules

## Coordinate mapping

Use building world positions already produced by the existing Berlin runtime.

Expected mapping path:

1. derive a representative geographic lookup point for each building or corner candidate
2. convert that geographic point into normalized image UV using the sidecar bounds
3. sample the PNG at that UV
4. use the sampled density to decide how many corners from that building survive

For first pass, north-up linear bounds mapping is enough:

- `u = (lon - west) / (east - west)`
- `v = (north - lat) / (north - south)`

Clamp out-of-range values and treat them as zero density.

## Recommended minimal implementation

Keep the diff small:

1. add a tiny heatmap asset contract and loader local to `berlin-flight`
2. extend the candidate-stage seam so it can limit accepted corners per building from heatmap density
3. raise `MAX_CORNERS_PER_BUILDING` ceiling from `1` to `2`
4. keep the extractor, spacing filter, and cone placement logic otherwise intact

Do not add:

- live heatmap reload
- editor tooling
- arbitrary projection systems
- probabilistic density
- runtime re-generation after load

## Suggested module split

Keep this local and boring:

- `heatmaps/types.ts`
- `heatmaps/camera-density.ts`
- `heatmaps/camera-density-loader.ts`
- a small extension to the existing placement candidate-stage seam

If one of these can be avoided by reusing an existing local file cleanly, avoid the extra file.

## Phase 1 - Lock the asset contract

### Objective

Define the PNG + JSON contract and keep path handling explicit.

### Deliverables

- typed sidecar JSON contract
- one canonical asset path
- explicit assumption that north is up

### Checks

- no `any`
- no new generalized asset framework
- clear error when PNG or JSON is missing

### Coding agent prompt

```text
Define the Berlin heatmap asset contract for cone density.

Constraints:
- work only under src/lib/experiences/berlin-flight/
- no any
- no new generic asset system
- keep files small and explicit

Tasks:
1. Add a tiny typed contract for a PNG heatmap plus JSON sidecar bounds.
2. Assume north-up image orientation.
3. Point the implementation at src/lib/experiences/berlin-flight/heatmaps/camera-density.berlin.png and matching .json.
4. Fail clearly if the asset pair is missing or malformed.

Return:
- files added or updated
- final asset contract
- any assumptions kept intentionally narrow
```

## Phase 2 - Build the simplest loader

### Objective

Load the heatmap once and expose deterministic density sampling.

### Deliverables

- one-time PNG decode on load
- sidecar bounds parse
- a sampler API that returns `0..1` density

### Checks

- simplest grayscale path
- use luminance from RGB
- invert to `density = 1 - luminance`
- clamp outside-image samples to `0`

### Coding agent prompt

```text
Implement a minimal Berlin heatmap loader and sampler for cone density.

Constraints:
- work only under src/lib/experiences/berlin-flight/
- load once on startup, no live updates
- no any
- no new dependency unless already installed and clearly necessary
- prefer the smallest browser-safe/runtime-safe path that fits the existing app

Tasks:
1. Load camera-density.berlin.png and camera-density.berlin.json once.
2. Decode image luminance with the simplest path.
3. Expose a sampler that takes geographic coordinates and returns density in 0..1.
4. Use the sidecar bounds with north-up orientation.
5. Return 0 for out-of-range lookups.

Return:
- loader API
- sampler API
- where initialization happens
- any dependency choice and why
```

## Phase 3 - Connect heatmap density to per-building candidate count

### Objective

Use the existing placement seam to decide whether a building keeps 0, 1, or 2 candidates.

### Deliverables

- deterministic count mapping from density
- per-building cap derived from heatmap
- no change to downstream cone orientation logic

### Rules

- `density < 0.34` -> keep `0`
- `0.34 <= density < 0.67` -> keep `1`
- `density >= 0.67` -> keep `2`

### Checks

- keep behavior deterministic
- avoid touching the cone-placement controller unless required by types
- do not reimplement building placement

### Coding agent prompt

```text
Connect the Berlin heatmap sampler to the existing roof-corner candidate stage.

Constraints:
- work only under src/lib/experiences/berlin-flight/
- reuse the existing candidate-stage seam
- no broad refactor
- no probabilistic logic
- no any

Tasks:
1. For each building or its candidate set, sample the heatmap at a representative location.
2. Convert sampled density into allowed candidate count:
   - < 0.34 => 0
   - < 0.67 => 1
   - otherwise => 2
3. Trim that building's candidate list deterministically before global spacing runs.
4. Raise the current per-building ceiling from 1 to 2 where needed.
5. Keep all existing placement/orientation behavior intact after that point.

Return:
- exact integration point used
- files changed
- how representative sample position is chosen
```

## Phase 4 - Align image space to Berlin space

### Objective

Make the first-pass whole-Berlin alignment explicit and debuggable.

### Deliverables

- clear world/geo/image mapping path
- one debug note or counters showing asset loaded and bounds used

### Checks

- visual approximation is acceptable
- no projection rabbit hole
- use current Berlin local/world coordinate assumptions

### Coding agent prompt

```text
Make the Berlin heatmap alignment explicit and debuggable without overbuilding it.

Constraints:
- keep the first pass visually approximate
- no GIS framework
- no any
- keep changes local to berlin-flight

Tasks:
1. Document or encode the exact mapping from Berlin world/geographic coordinates to image UV.
2. Surface enough debug information to confirm:
   - heatmap loaded
   - image dimensions
   - geographic bounds
   - sampled density for at least one known position
3. Keep this lightweight and local to the existing Berlin debug path if possible.

Return:
- mapping summary
- debug output added
- any known alignment limitations
```

## Phase 5 - Add minimal checks

### Objective

Leave one small check behind for the non-trivial mapping logic.

### Deliverables

- one runnable test or assert-based check for density threshold behavior
- one check for north-up bounds mapping

### Checks

- no giant test harness
- cover the threshold edges and one coordinate sample

### Coding agent prompt

```text
Add the smallest useful checks for the Berlin heatmap density logic.

Constraints:
- no large test framework additions
- keep checks narrow and local
- no any

Tasks:
1. Add one small test for density-to-count mapping:
   - below 0.34 => 0
   - 0.34 => 1
   - 0.67 => 2
2. Add one small check for north-up bounds mapping to image UV.
3. Keep the tests focused on the new heatmap logic only.

Return:
- test files added or updated
- behaviors covered
- anything intentionally left untested
```

## Risks

1. The current runtime may not already expose the geographic lookup point needed at the candidate-stage seam.
2. World-to-geo conversion may need a small local helper if only local Berlin coordinates are available there.
3. A building-level representative sample point may not perfectly match building footprint coverage in the PNG.
4. Global spacing can still reduce visible density in very dark districts, which is acceptable for first pass.

## Recommended execution order

1. asset contract
2. one-time loader and sampler
3. density-to-count integration at the candidate seam
4. lightweight debug visibility
5. minimal checks

## Out of scope

- hand-authored district masks beyond the PNG
- smooth interpolation between `0/1/2` counts
- more than 2 cameras per building
- runtime heatmap swapping
- UI for alignment correction
