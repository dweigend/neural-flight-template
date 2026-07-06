# Precomputed Cones — Plan

## Goal

Remove cone generation from runtime.

Berlin cone positions and orientations should be computed once for the whole Berlin dataset, saved as a reusable artifact, and loaded at runtime by world position as the player moves.

Success criteria:

- no roof-corner extraction during flight
- no heatmap density sampling during flight
- no neighborhood sampling during flight
- no cone orientation solving during flight
- no cone pop-in caused by recomputation after tile reload
- cone data loads deterministically from precomputed world chunks
- Quest frame time improves because runtime only streams cone data and updates rendering/collision

## Confirmed direction

- precompute scope: whole Berlin dataset, not “first visit” cache
- runtime key: stable world-space chunk coordinates, not `tileUrl`
- source acquisition: stream Cesium tiles once, export source meshes locally, then build cone artifacts from those local exports
- persistence model: local exported source meshes plus generated cone chunks, not browser-local IndexedDB as the primary source
- heatmap placement rule: baked into the generated dataset before runtime
- runtime behavior: load nearby cone chunks by player position
- existing live cone-generation path: removable after validation

## Core insight

Current problem chain:

```text
Tile loads
  -> find nearby building meshes
  -> extract roof corners over time
  -> sample surrounding geometry over time
  -> solve cone orientation over time
  -> rebuild active cone set

Tile unloads
  -> derived cone state disappears with runtime state

Tile reloads
  -> repeat the same work
```

Target model:

```text
One-time source capture
  -> stream Cesium tiles across Berlin once
  -> export tracked tile meshes grouped by stable tile identity

Offline build step
  -> read exported Berlin source meshes once
  -> apply heatmap density placement rule once
  -> extract accepted cone volumes once
  -> write cone chunks keyed by world region

Runtime
  -> player moves
  -> load nearby cone chunks by world position
  -> feed active cones to rendering and collision
  -> unload far cone chunks from memory
```

The expensive part moves out of the headset runtime and into a one-time capture plus offline asset-generation step.

## Architecture

```text
One-time source capture
  -> Cesium streamed Berlin tiles
  -> tracked tile meshes
  -> local source-mesh files grouped by tile identity

offline generator
  -> exported source meshes
  -> roof-corner extraction
  -> heatmap-based candidate limiting
  -> placement filtering
  -> mesh-neighborhood sampling
  -> cone orientation solving
  -> world-chunked cone dataset

world-chunked cone dataset
  -> cone chunk index / manifest
  -> chunk files keyed by local Berlin coordinates

runtime chunk store
  -> loads chunk files near player
  -> caches loaded chunks in memory

BerlinConeGridRuntime
  -> queries loaded cones
  -> updates InstancedMesh

BerlinCollisionController
  -> consumes active cones
  -> updates cone mask for tracked meshes
```

## Data model

Use stable world chunks in Berlin local space.

Recommended chunk key:

```typescript
type BerlinConeChunkKey = `${number}:${number}`;
```

Where each number is a chunk coordinate derived from local Berlin world space:

- `chunkX = floor(worldX / chunkSizeMeters)`
- `chunkZ = floor(worldZ / chunkSizeMeters)`

Recommended first-pass chunk size:

- `240m` or `480m`

The exact value should match the existing Berlin spatial scale and be large enough to keep file count reasonable.

## Heatmap placement rule

The offline dataset build must include the heatmap-based placement logic already defined under:

- [heatmaps/camera-density.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density.ts)
- [heatmaps/camera-density-loader.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density-loader.ts)
- [heatmaps/camera-density.berlin.png](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density.berlin.png)
- [heatmaps/camera-density.berlin.json](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density.berlin.json)
- [heatmap-cone-density-plan.md](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/docs/heatmap-cone-density-plan.md)

That means cone placement density is decided offline, before chunk data is written.

Runtime should not:

- decode the heatmap
- sample heatmap density
- decide whether a building gets `0`, `1`, or `2` cone candidates

The offline build should keep the same deterministic rule:

- `density < 0.34` -> `0`
- `0.34 <= density < 0.67` -> `1`
- `density >= 0.67` -> `2`

This heatmap step belongs between raw roof-corner extraction and final accepted-point selection for cone generation.

## Serialization format

Keep the runtime payload flat and boring.

```typescript
export interface BerlinConeChunkData {
  chunkKey: string;
  chunkWorldMinX: number;
  chunkWorldMinZ: number;
  chunkSizeMeters: number;
  positions: Float32Array; // [tipX, tipY, tipZ, axisX, axisY, axisZ, ...]
  scalars: Float32Array; // [radius, height, radius, height, ...]
  coneIndex: Int32Array;
}
```

Notes:

- do not store `THREE.Vector3` in the asset
- do not key runtime data by tile URL
- strings like `placementPointId` and `sourceBuildingId` should only stay if runtime or debugging actually needs them
- prefer `Float32Array` unless there is a demonstrated precision problem in Berlin local space

## Runtime contract

At runtime, the cone system should answer one question:

```text
Given player position P, which precomputed cone chunks should be loaded now?
```

That means the runtime cone path becomes:

```text
tick()
  -> tilesRuntime.update()
  -> coneChunkRuntime.update(playerPosition)
      -> compute required chunk keys
      -> load missing chunk data
      -> unload far chunk data from memory
  -> coneRuntime.update(playerPosition)
      -> query active cones from loaded chunks
      -> update InstancedMesh incrementally
  -> collisionController.update()
```

What disappears from runtime:

- `BerlinPlacementController.update(...)`
- `BerlinConePlacementController.update(...)`
- runtime heatmap sampling for placement density
- runtime calls to:
  - `extractBerlinRoofCornerCandidates(...)`
  - heatmap density lookup for candidate count
  - `sampleBerlinMeshNeighborhood(...)`
  - `solveBerlinConeAxisDirection(...)`

## Existing integration points

The current code already defines the logic that should move offline:

- roof-corner extraction in [placement/corner-extractor.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/corner-extractor.ts)
- heatmap density sampling in [heatmaps/camera-density.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density.ts)
- heatmap asset loading in [heatmaps/camera-density-loader.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/heatmaps/camera-density-loader.ts)
- accepted-point filtering in [placement/corner-registry.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/placement/corner-registry.ts)
- neighborhood sampling in [cone-placement/mesh-neighborhood.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/cone-placement/mesh-neighborhood.ts)
- orientation solving in [cone-placement/orientation-solver.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/cone-placement/orientation-solver.ts)
- cone rendering in [runtime/cone-grid-runtime.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/cone-grid-runtime.ts)
- cone-driven collision in [collision/controller.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/collision/controller.ts)

The plan should reuse these rules. It should not invent a second cone algorithm.
The same applies to the heatmap rule: reuse it offline instead of reimplementing a different density policy in the dataset builder.

## Asset layout

Keep the artifact local to `berlin-flight`.

Recommended layout:

- `src/lib/experiences/berlin-flight/cone-data/manifest.json`
- `src/lib/experiences/berlin-flight/cone-data/chunks/`
- `scripts/berlin-flight/build-cone-dataset.ts`

If the final Berlin payload is too large for `src/`, move the generated chunk files to the same offline asset location used by the offline tiles workflow. The contract stays the same.

## Manifest contract

The runtime needs one small manifest that describes the dataset.

```typescript
export interface BerlinConeDatasetManifest {
  version: number;
  origin: {
    x: number;
    z: number;
  };
  chunkSizeMeters: number;
  bounds: {
    minChunkX: number;
    maxChunkX: number;
    minChunkZ: number;
    maxChunkZ: number;
  };
  chunkCount: number;
}
```

The runtime should not scan directories or guess file names.

## Phase 1 - Lock the offline cone dataset contract

### Objective

Define the asset format, chunking scheme, and runtime assumptions before changing behavior.

### Deliverables

- typed chunk manifest contract
- typed chunk payload contract
- explicit chunk-key scheme in Berlin local world space
- explicit decision that `tileUrl` is not part of the data model

### Checks

- no IndexedDB-first design
- no tile-identity cache keys
- no `THREE.Vector3` in serialized assets
- no `any`

### Coding agent prompt

```text
Define the offline dataset contract for precomputed Berlin cones.

Constraints:
- work only under src/lib/experiences/berlin-flight/
- no any
- no browser-local persistence as the primary design
- key data by stable world chunk coordinates, not tileUrl

Tasks:
1. Add typed contracts for a cone dataset manifest and cone chunk payload.
2. Define a chunk-key scheme based on Berlin local world space.
3. Keep the serialized format flat and structured-clone or binary friendly.
4. Document the runtime assumptions clearly in code comments where needed.

Return:
- files added or updated
- final manifest contract
- final chunk payload contract
- any assumptions intentionally kept narrow
```

## Phase 2 - Build the offline generator path

### Objective

Move the existing cone-generation logic and heatmap-based placement logic into a one-time dataset build step.

### Deliverables

- a script or build entrypoint that scans Berlin source data
- reuse of the existing heatmap density rule
- reuse of the existing roof-corner and orientation rules
- output chunk files plus manifest

### Checks

- reuse existing extraction and solving logic where possible
- reuse the existing heatmap loader/sampler logic or its exact rule
- do not maintain a second cone algorithm
- do not maintain a second heatmap placement rule
- deterministic output across repeated runs on the same source data
- explicit failure when source tiles or offline inputs are missing

### Notes

This phase is where the expensive work belongs:

- `extractBerlinRoofCornerCandidates(...)`
- heatmap density lookup and candidate cap selection
- accepted-point filtering
- `sampleBerlinMeshNeighborhood(...)`
- `solveBerlinConeAxisDirection(...)`

### Coding agent prompt

```text
Build the offline Berlin cone dataset generator.

Constraints:
- reuse the existing Berlin cone rules where practical
- reuse the existing Berlin heatmap placement rule
- no any
- no speculative framework around the generator
- keep the output keyed by world chunk coordinates

Tasks:
1. Add a build script that reads Berlin source geometry offline.
2. Reuse the existing roof-corner extraction, heatmap density, and cone-orientation rules.
3. Produce a manifest plus chunk files.
4. Keep output deterministic for the same input geometry.
5. Fail clearly when required offline source data or heatmap assets are missing.

Return:
- generator entrypoint
- generated artifact layout
- which existing runtime modules or heatmap modules were reused
- any generator-only assumptions
```

## Phase 3 - Add the simplest runtime chunk loader

### Objective

Load precomputed cone chunks by player position with a minimal runtime API.

### Deliverables

- manifest loader
- chunk loader keyed by chunk coordinates
- in-memory loaded-chunk map
- query API for active cones near the player

### Checks

- no offline computation in runtime
- no heatmap density computation in runtime
- no IndexedDB dependency required for correctness
- one clear source of truth: manifest + chunk files
- clear behavior when a chunk file is missing or malformed

### Suggested module split

- `cone-data/types.ts`
- `cone-data/manifest.ts`
- `cone-data/chunk-loader.ts`
- `cone-data/runtime-store.ts`

If one of these can be collapsed cleanly, collapse it.

### Coding agent prompt

```text
Implement the minimal runtime loader for precomputed Berlin cone chunks.

Constraints:
- work only under src/lib/experiences/berlin-flight/
- no any
- no runtime cone generation
- no runtime heatmap sampling for placement
- no IndexedDB required for the first pass

Tasks:
1. Load the cone dataset manifest once.
2. Given player position, derive required chunk keys.
3. Load missing chunk files into an in-memory map.
4. Expose a query that returns active cones from loaded chunks.
5. Drop far chunks from memory with a simple distance rule.

Return:
- runtime loader API
- chunk selection rule
- in-memory cache shape
- error behavior
```

## Phase 4 - Switch the cone runtime to chunk-driven data

### Objective

Make cone rendering consume precomputed chunk data instead of live controller output.

### Deliverables

- `BerlinConeGridRuntime` driven by loaded chunk data
- removal of cone input from the old placement pipeline
- incremental active-cone updates where possible

### Checks

- avoid full mesh teardown on every small cone-set change if a small incremental path is practical
- keep visible-cone selection deterministic
- keep the diff focused on the Berlin cone runtime
- runtime must treat loaded chunk data as final cone truth, not as input to more placement decisions

### Notes

The current runtime still does full mesh rebuilds on source changes. This phase should at least stop the live generation path; if practical, it should also reduce rebuild churn while chunks stream in.

### Coding agent prompt

```text
Switch BerlinConeGridRuntime to consume precomputed cone chunks.

Constraints:
- no any
- no live cone generation in runtime
- keep the diff scoped to berlin-flight
- prefer the smallest incremental update path that actually helps

Tasks:
1. Make the cone runtime query loaded chunk data by player position.
2. Stop feeding it cones from BerlinConePlacementController.
3. Keep active-cone ordering deterministic.
4. Reduce mesh rebuild churn if possible without broad refactor.

Return:
- runtime changes
- whether mesh updates stayed full rebuild or became incremental
- what remains for later tuning
```

## Phase 5 - Adapt collision to the precomputed cone stream

### Objective

Keep collision behavior correct while the cone source changes from live generation to chunked data.

### Deliverables

- collision controller consuming chunk-driven active cones
- correct dirty-mesh invalidation when active chunk cones change
- no dependency on placement/cone-placement controllers for collision correctness

### Checks

- keep collision semantics unchanged
- avoid broad collision refactors unless profiling proves they matter
- no hidden dependence on tile URL keys

### Coding agent prompt

```text
Adapt Berlin collision to consume precomputed chunk-driven cones.

Constraints:
- no any
- keep current collision semantics
- no broad rewrite unless required for correctness

Tasks:
1. Wire collision to the new active cone source.
2. Ensure mesh invalidation still happens when active cones change.
3. Remove dependency on the old live cone-generation path where possible.

Return:
- files changed
- collision invalidation behavior
- any remaining hot spots worth profiling later
```

## Phase 6 - Remove the live cone-generation path

### Objective

Delete the runtime placement/orientation pipeline once the chunked dataset path is proven.

### Deliverables

- `scene.ts` no longer updates placement and cone-placement for cones
- `scene.ts` no longer needs heatmap-driven placement decisions for cones
- old cone-generation runtime path removed or fully orphaned behind an explicit debug switch
- debug overlay updated to report the new chunk-based state

### Checks

- do not leave two competing runtime cone sources active
- remove dead code if it is clearly unused
- keep useful debug stats

### Coding agent prompt

```text
Remove the live Berlin cone-generation runtime path after the chunked dataset path is working.

Constraints:
- no any
- keep useful debug instrumentation
- do not leave duplicate active paths for cones

Tasks:
1. Remove cone-related use of BerlinPlacementController and BerlinConePlacementController from runtime.
2. Clean up scene wiring and debug overlay reporting.
3. Delete or isolate dead cone-generation runtime code if it is no longer used.

Return:
- files removed or updated
- what runtime path now owns cones
- any code intentionally kept for offline generation reuse
```

## Phase 7 - Validate Quest behavior and tighten the asset

### Objective

Verify that the new design actually improves headset behavior and tune chunk size or payload shape if needed.

### Deliverables

- Quest validation pass
- chunk-size tuning notes
- memory and load-behavior notes
- final call on whether more runtime incrementality is needed

### Checks

- cones appear without generation delay
- no pop-in caused by recomputation
- acceptable memory use for loaded chunks
- acceptable chunk-load behavior while moving quickly

### Validation targets

- warm and cold app start
- fast traversal across chunk boundaries
- tile unload and reload behavior
- collision consistency on chunk transitions

### Coding agent prompt

```text
Validate the precomputed Berlin cone dataset path on Quest and tighten the last weak spots.

Constraints:
- focus on observed runtime behavior
- no speculative feature work
- keep fixes narrowly tied to measured problems

Tasks:
1. Verify cones no longer depend on runtime generation.
2. Check chunk transition behavior while flying.
3. Review memory behavior for loaded chunk data.
4. Tune chunk size or simple loader policy if the current values are obviously wrong.

Return:
- observed issues
- fixes applied
- remaining risks
- final recommendation on whether further runtime incrementality is needed
```

## Phase 8 - Export full-Berlin cone source meshes from streamed Cesium tiles

### Objective

Replace the current 1km Berlin-center sample capture with a repeatable full-city source export that streams the live Cesium source once and saves the resulting source meshes locally.

### Deliverables

- an exporter path that resolves the existing Berlin Cesium source through `resolveBerlinTilesSource()`
- a sweep across Berlin coverage that captures tracked tile meshes
- source-mesh files written under `cone-data/source-meshes/`
- dedupe keyed by tile `sourceUrl`, not by sweep cell or player position
- clear local output that can be reused by later dataset rebuilds without re-streaming Berlin

### Checks

- reuse `TilesRuntimeAdapter` and `getTrackedTileMeshes()` rather than writing a second tile parser first
- do not keep all Berlin geometry in one giant source JSON file
- do not treat the current `center-1km.json` capture as the final source input
- group output by stable tile identity so repeated runs can skip or overwrite deterministically
- fail clearly when the Cesium source is not configured or the sweep collects no meshes
- the exporter should save local artifacts; it should not require a pre-downloaded `/tiles/berlin/tileset.json`

### Notes

This phase closes the gap between:

- proving the cone dataset pipeline on a small sample
- producing the real full-Berlin cone source input

The shortest path is:

1. resolve the existing Berlin Cesium source through the normal runtime source resolver
2. load it through the existing Berlin tile runtime
3. move a capture camera across a coarse Berlin grid
4. wait for tile loading to stabilize at each step
5. export unseen tracked meshes grouped by tile `sourceUrl`
6. save those source meshes locally so later dataset rebuilds do not need to hit Cesium again

### Coding agent prompt

```text
Build the full-Berlin cone source export path on top of the existing streamed Cesium tiles runtime.

Constraints:
- reuse TilesRuntimeAdapter and tracked mesh export code where practical
- no any
- do not add a second raw 3D Tiles parser unless the runtime sweep is clearly insufficient
- keep the exporter scoped to berlin-flight
- prefer multiple source mesh files over one giant file

Tasks:
1. Load the configured Berlin Cesium source through the existing runtime path.
2. Add a sweep/export flow that moves across Berlin coverage and waits for tile loading to settle.
3. Collect tracked meshes from getTrackedTileMeshes().
4. Group exported meshes by stable tile sourceUrl and write source-mesh files under cone-data/source-meshes/.
5. Dedupe exported output by tile sourceUrl so overlapping sweep cells do not create duplicate geometry.
6. Save the exported source meshes locally so future dataset rebuilds do not need to re-stream Cesium.
7. Fail clearly when the Cesium source is not configured or the sweep does not collect any meshes.

Return:
- exporter entrypoint
- sweep strategy
- source-mesh file layout
- dedupe key
- any assumptions about Cesium availability during the one-time export
```

## Phase 9 - Emit the full-Berlin source manifest and rebuild the final cone dataset

### Objective

Turn the exported full-city source meshes into the final manifest input for the cone dataset build, then rebuild the chunked cone asset for all of Berlin.

### Deliverables

- a full-Berlin cone source manifest listing all exported source-mesh files
- no `center` or `radiusMeters` filter in the final full-city manifest
- a documented rebuild command for the final citywide dataset
- regenerated `cone-data/generated/` output based on the full manifest

### Checks

- do not keep the sample `radiusMeters: 1000` filter in the final manifest
- do not rebuild the final dataset from only `center-1km.json`
- preserve deterministic manifest ordering
- keep the output path compatible with the existing cone dataset builder
- the final manifest should be usable directly by `build-cone-dataset.ts`

### Notes

The current sample capture is useful for proving the pipeline, but the final citywide build should:

- list many source files
- omit the sample radius filter
- feed all exported Berlin source meshes into the existing dataset builder

The final full-city source manifest should be boring and explicit. It should point at the locally saved source-mesh exports from phase 8, and it should not require Cesium access during the rebuild itself.

### Coding agent prompt

```text
Emit the final full-Berlin cone source manifest and rebuild the precomputed cone dataset from it.

Constraints:
- no any
- reuse the existing source manifest contract and build-cone-dataset script
- keep ordering deterministic
- do not leave the final build dependent on the 1km sample capture

Tasks:
1. Generate a full-Berlin cone source manifest that lists all exported source-mesh files.
2. Omit center/radius filters from the final manifest so the builder consumes the full city export.
3. Keep manifest entries ordered deterministically.
4. Run or document the final dataset rebuild through build-cone-dataset.ts using the new manifest.
5. Confirm the generated cone-data output now represents the full exported Berlin source set rather than the sample capture.

Return:
- final manifest path
- whether the build was run or only wired/documented
- final rebuild command
- any remaining size or runtime risks worth measuring later
```

## Migration order

Implementation order should follow the phases:

1. Phase 1 - dataset contract
2. Phase 2 - offline generator
3. Phase 3 - runtime chunk loader
4. Phase 4 - cone runtime cutover
5. Phase 5 - collision adaptation
6. Phase 6 - remove old runtime path
7. Phase 7 - Quest validation and tuning
8. Phase 8 - full-Berlin source export from streamed Cesium tiles
9. Phase 9 - full-Berlin manifest and final dataset rebuild

The key rule is simple:

```text
Do not remove the live runtime path until the offline-generated chunk dataset is loading correctly in the scene.
```

For the real full-city asset, another rule matters:

```text
Do not treat the 1km Berlin-center source capture as the final build input. The final dataset must be rebuilt from the full-Berlin exported source manifest.
```

And for source acquisition:

```text
Use Cesium only for the one-time full-Berlin source export. The final cone dataset rebuild must run from the locally saved source-mesh exports, not from live tile streaming.
```

## Non-goals for the first pass

- browser-local IndexedDB cone persistence
- per-user cone authoring
- live cone recomputation after tiles load
- runtime heatmap-driven candidate selection
- editor tooling for cone data
- generalized spatial asset framework
- compression work before there is a measured payload problem

## Why this version is better

This version matches the actual goal.

It is not “compute on first visit and cache by tile”.
It is “compute once for Berlin, store by world region, and stream like any other offline asset”.

That is the version that meaningfully reduces runtime work.
