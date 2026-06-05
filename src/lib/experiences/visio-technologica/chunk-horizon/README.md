# Chunk Horizon

`chunk-horizon` selects the memoryless event horizon around an observer.

This layer sits between `chunk-core` and a concrete route or world. `chunk-core`
describes where chunks are in world space. `chunk-horizon` answers which chunk
bounds are relevant for a current view direction, distance, field of view, and
fade policy.

## Current Structure

- `viewChunkHorizon.ts` computes visible chunk bounds from explicit observer
  position, world-space view directions, chunk dimensions, view distance, field
  of view, and fade parameters.
- `index.ts` exposes the public chunk-horizon API.

## What Belongs Here

- Renderer-free event horizon selection.
- Memoryless visible chunk queries.
- Distance and field-of-view edge fade metadata.
- Stable signatures that help callers decide whether derived visuals need to be
  rebuilt.
- Explicit world-space direction and position inputs.

## What Does Not Belong Here

- Three.js cameras, vectors, scenes, materials, geometries, or renderers.
- Svelte components, browser events, pointer lock, animation loops, or DOM state.
- Concrete key bindings, flight speed, mouse sensitivity, colors, or debug UI.
- Loading, caching, persistence, active/inactive chunk stores, or disposal logic.
- Hidden chunk dimensions, field-of-view defaults, or world configuration.

## Protected Boundary

`chunk-horizon` imports spatial facts only from the public `chunk-core` API. It
does not import implementation files from other library folders. Routes and
worlds compose this layer with runtime, controls, parameters, and visualization.
