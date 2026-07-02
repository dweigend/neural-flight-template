# Berlin Flight Cone-to-Tile Collision Plan

## Goal

Detect which parts of the streamed Berlin Cesium/Google 3D Tiles meshes fall inside the procedural cone grid, then color those parts differently as the first visible proof. After that, evolve the same pipeline into a partial material override system.

## Current integration points

- [scene.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/scene.ts)
  - owns per-frame orchestration
  - already updates `coneRuntime` and `tilesRuntime`
- [runtime/cone-grid-runtime.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/cone-grid-runtime.ts)
  - owns the cone placement grid
  - already knows the canonical cone radius, height, spacing, and chunking
- [runtime/tiles-runtime.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/runtime/tiles-runtime.ts)
  - owns the `TilesRenderer`
  - already intercepts `load-model`
  - already replaces tile materials globally

That means the narrowest implementation path is:

1. expose cone volumes from `cone-grid-runtime.ts`
2. intercept newly loaded tile meshes in `tiles-runtime.ts`
3. preprocess mesh-local collision data once
4. update color/material state incrementally as cones stream around the player

## Core constraint

The streamed city geometry is arbitrary triangle mesh data. There is no semantic "roof piece" or "wall piece" we can recolor directly. So the first practical solution is vertex-driven masking:

- test mesh vertices against cone volumes
- mark affected vertices
- derive a debug color from that mask

This will color full triangles whose vertices are marked, so the edge will be approximate at first. That is acceptable for the debug phase.

## Recommended phases

## Phase 1 - Build stable cone volume data

### Objective

Make the cone runtime expose collision-ready cone descriptors without coupling collision code to instanced render internals.

### Deliverables

- Add a typed cone descriptor:
  - `center: THREE.Vector3`
  - `radius: number`
  - `height: number`
  - `chunkKey: string`
  - `coneIndex: number`
- Add a readonly query API on `BerlinConeGridRuntime`, for example:
  - `getActiveCones(): readonly BerlinConeVolume[]`
  - optionally `getActiveConeChunks(): readonly BerlinConeChunkSnapshot[]`
- Keep the existing `InstancedMesh` rendering path unchanged

### Notes

- Cone collision should use the same config source as rendering: `BERLIN_CONE_GRID`
- Keep cone descriptors in world/local Berlin space, matching the tiles group after the ECEF-to-local transform is applied

## Phase 2 - Track streamed tile meshes explicitly

### Objective

Capture every streamed mesh once, keep per-mesh collision state, and clean it up when the tile unloads.

### Deliverables

- Extend `TilesRuntimeAdapter` to handle both:
  - `load-model`
  - `dispose-model`
- On `load-model`, collect every `THREE.Mesh<BufferGeometry>` under the tile scene
- For each mesh, create a registry entry with:
  - mesh reference
  - geometry reference
  - original material reference
  - debug material or debug color state
  - local-space bounding box / bounding sphere
  - cached world matrix version inputs needed for collision refresh

### Notes

- Do not keep this state in `scene.ts`; keep it Berlin-local inside a small collision subsystem
- `tiles-runtime.ts` is already the right hook for streamed lifecycle events

## Phase 3 - Preprocess mesh-local collision data

### Objective

Convert each loaded mesh into data that can be tested against cones cheaply at runtime.

### Deliverables

- For each tracked mesh:
  - read `geometry.attributes.position`
  - create a reusable array of local vertex positions
  - optionally create a parallel world-position scratch buffer
  - compute local bounding box and bounding sphere
- If the geometry has no `position` attribute, skip it early

### Recommended data model

Create a Berlin-local subsystem under something like:

- `collision/types.ts`
- `collision/cone-volume.ts`
- `collision/mesh-registry.ts`
- `collision/vertex-mask.ts`
- `collision/debug-color.ts`
- `collision/controller.ts`

Suggested tracked mesh type:

```ts
type TrackedTileMesh = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  positions: Float32Array;
  vertexCount: number;
  localBounds: THREE.Box3;
  localSphere: THREE.Sphere;
  vertexMask: Uint8Array;
  colorAttribute: THREE.BufferAttribute | null;
  originalMaterial: THREE.Material | THREE.Material[];
};
```

## Phase 4 - Broad-phase cone/mesh filtering

### Objective

Avoid per-vertex cone checks for every mesh in every frame.

### Deliverables

- For each tracked mesh, compute a world-space bounds proxy:
  - transformed bounding sphere is enough for the first pass
- For each active cone, compute a simple bounds proxy:
  - cylinder-like radius test in `x/z`
  - `y` range from cone base to tip
- Only run narrow-phase vertex checks when cone and mesh bounds overlap

### Recommended first-pass bounds

Use a conservative cylinder approximation for the cone:

- horizontal radius: `BERLIN_CONE_GRID.CONE_RADIUS`
- vertical range:
  - base `y = ORIGIN_HEIGHT`
  - top `y = ORIGIN_HEIGHT + CONE_HEIGHT`

This is cheaper than testing the exact cone shape in the broad phase.

## Phase 5 - Narrow-phase vertex-in-cone test

### Objective

Mark which vertices of a mesh lie inside one or more cones.

### Deliverables

- Implement a pure function:
  - input: vertex world position + cone descriptor
  - output: inside / outside
- For each candidate mesh:
  - reset or incrementally update `vertexMask`
  - test vertices only against overlapping cones
  - mark `vertexMask[i] = 1` when the vertex is inside any cone

### Exact cone test

Assuming the cone base is at `baseY` and the tip is at `baseY + height`:

1. reject if `y < baseY` or `y > baseY + height`
2. compute normalized height:
   - `t = (y - baseY) / height`
3. compute allowed radius at that height:
   - `allowedRadius = radius * (1 - t)`
4. compute horizontal distance from cone center in `x/z`
5. vertex is inside if `distanceXZ <= allowedRadius`

### Important detail

This test should run in the same local Berlin coordinate space used by the cones. Because the whole tileset group gets transformed once in [scene.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/scene.ts), use final world-space positions from the tracked mesh `matrixWorld`.

## Phase 6 - Debug color proof

### Objective

Show the collision result immediately without yet solving final material blending.

### Deliverables

- Attach a `color` buffer attribute to tracked geometries if missing
- Write per-vertex colors:
  - default color = current Berlin neutral grey
  - hit color = a clear debug accent, for example bright green or magenta
- Swap debug material creation to a vertex-color-capable material

### Recommended implementation

Replace the current one-size-fits-all material override with a material factory that supports vertex colors:

```ts
new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  flatShading: true,
  metalness: 0,
  roughness: 0.5,
});
```

Then encode the neutral tile tone in the `color` attribute itself.

### Why this is the right first step

- no shader work required yet
- works on arbitrary streamed triangle meshes
- easy to debug visually
- reuses the same collision mask for later material logic

## Phase 7 - Incremental runtime updates

### Objective

Keep updates bounded as the player moves and cone chunks stream in/out.

### Deliverables

- Only recompute when:
  - cone chunk set changes
  - a new tile mesh loads
  - a tile mesh unloads
- Do not rescan every tracked mesh every frame
- Add a work budget:
  - max meshes processed per tick
  - max vertices processed per tick if needed

### Strategy

Maintain a dirty queue:

- mark meshes dirty when loaded
- mark nearby meshes dirty when cone chunks change
- process a bounded number each tick from `scene.ts`

This keeps frame time predictable on Quest.

## Phase 8 - Move from debug color to partial material override

### Objective

Use the same collision mask to drive a different look for cone-covered mesh regions.

### Two realistic options

### Option A - Stay with vertex colors

Use the mask to blend between two looks per vertex:

- neutral city tone
- highlighted cone-covered tone

This is still one material, but visually behaves like a partial material change.

Pros:

- simplest
- low risk
- works with current mesh structure

Cons:

- triangle-edge transitions stay coarse

### Option B - Custom shader patch on top of the current material

Keep a custom attribute such as `coneMask` and use `onBeforeCompile` or a custom shader material to blend between two material responses in the fragment shader.

Pros:

- better artistic control
- can move beyond flat color into roughness/emissive/opacity differences

Cons:

- more maintenance
- more fragile with streamed third-party content

### Recommendation

Ship Option A first. Only move to shader blending after the collision mask is stable and performant.

## Recommended file ownership

Keep `scene.ts` as orchestration only. Add Berlin-local files:

- `runtime/cone-grid-runtime.ts`
  - expose collision-ready cone snapshots
- `runtime/tiles-runtime.ts`
  - expose tile mesh load/unload hooks
- `collision/types.ts`
- `collision/mesh-tracker.ts`
- `collision/cone-query.ts`
- `collision/cone-mesh-bounds.ts`
- `collision/vertex-cone-test.ts`
- `collision/vertex-color-writer.ts`
- `collision/controller.ts`

Potential state additions in [types.ts](/Users/juliuswenk/Desktop/KD/borrowed-senses/neural-flight-template/src/lib/experiences/berlin-flight/types.ts):

- `collisionController`
- optional debug counters for:
  - tracked meshes
  - dirty meshes
  - meshes recolored this tick
  - vertices tested this tick
  - active cones

## Performance rules

- Never transform every vertex of every mesh every frame
- Use bounds rejection first
- Recompute only on cone or tile lifecycle changes
- Budget work per tick
- Skip tiny or invalid geometries early
- Dispose added attributes and cloned materials correctly on tile unload

## Validation plan

## Step 1 - Prove the data path

- log active cone count
- log tracked tile mesh count
- log dirty mesh queue length
- confirm `dispose-model` removes registry state

## Step 2 - Prove collision

- color hit vertices bright green
- place player over known cone clusters
- verify only overlapping city geometry changes

## Step 3 - Measure cost

- record worst-case vertices tested per tick
- record meshes recolored per tick
- verify VR framerate stays acceptable

## Step 4 - Only then improve visuals

- replace debug hit color with final highlight look
- evaluate whether vertex-color blending is enough
- only then consider shader-based partial material logic

## First implementation target

The first slice should be intentionally narrow:

1. expose active cone descriptors
2. track tile meshes on `load-model` / `dispose-model`
3. add broad-phase bounds checks
4. color vertices inside cones
5. update only when cones or tiles change

That gives a working collision proof without committing yet to a more expensive shader architecture.
