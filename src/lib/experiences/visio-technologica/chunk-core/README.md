# Chunk Core

`chunk-core` defines the renderer-free foundation for segmenting the room into chunks.

This layer answers only structural questions:

- What dimensions does a chunk have?
- How is world space segmented into chunk coordinates?
- How does a world position map to a chunk coordinate?
- How does a chunk coordinate map to an origin, bounds, or key?
- How can an explicit chunk frame be split into addressable subchunk cells?

It does not create visuals, manage active chunks, load data, or know about Three.js, Svelte, canvas lifecycle, materials, meshes, or runtime state.

Chunk dimensions, subchunk counts, and subchunk frame bounds must be provided
explicitly by the caller. This layer does not define hidden world defaults,
because room configuration should come from a visible project or world
configuration source.

## Current Structure

- `roomSegmentation.ts` validates dimensions, builds explicit chunk-coordinate
  grids, and converts between world positions, chunk coordinates, keys, origins,
  bounds, keyed bounds, and bounds envelopes.
- `subchunkRaster.ts` validates explicit chunk frames and creates deterministic
  subchunk cells.
- `index.ts` exposes the public chunk-core API.

## What Belongs Here

- Pure data types for chunk dimensions, coordinates, positions, origins, and bounds.
- Pure data types for axis-specific subchunk counts, subchunk coordinates, and
  subchunk world bounds.
- Deterministic calculations that describe how space is segmented.
- Explicit validation for required chunk dimensions.
- Explicit coordinate-grid helpers whose offsets are passed by the caller.
- Small helpers that can be tested without a renderer or browser.

## What Does Not Belong Here

- Three.js objects, geometries, materials, meshes, helpers, or labels.
- Svelte components or browser lifecycle code.
- Stores, managers, loading state, async work, asset loading, or disposal logic.
- Visibility selection, camera-distance prioritization, or active/inactive chunk state.
- Hidden fallback dimensions or implicit world configuration.
- Template placement rules, marker colors, route state, random seeds, or global
  config.

## Extension Rules

Extend this folder only when the change improves the pure spatial model. If a feature needs runtime state, loading, resource disposal, or visual output, it belongs in another layer.

If world configuration is added later, it should pass explicit dimensions into `chunk-core`. Missing or invalid dimensions should fail early instead of silently falling back.

Public subchunk field names intentionally include their coordinate space, such
as `worldPositionX`, `parentChunkCoordinate`, and `localSubchunkCoordinate`.
This keeps API boundaries readable when chunk, subchunk, world, and render
spaces are composed by routes or games.

The next likely file here would be `chunkNeighborhood.ts` if the core needs pure coordinate-neighbor calculations. Runtime selection and lifecycle should wait for `chunk-loading`.

## Protected Boundary

`chunk-core` must stay renderer-free. It provides stable spatial facts that other layers can consume, but it must not depend on those layers.
