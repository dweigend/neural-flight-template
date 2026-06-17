# Visio Technologica placement tool — Step 1 audit

## Boundary decision

Build the placement authoring tool as a **separate lab-launched scene** under `src/lib/experiences/visio-technologica/tool/`.

For v1, the tool should load the **same GLB chunk world data** as the runtime experience, not a proxy-only subset and not the full world eagerly.

Why:
- placement authoring needs accurate ray hits on the real scene geometry
- the existing chunk manifest and tile placement math already describe the real world layout
- eager full-world loading would add memory and startup cost without improving placement accuracy
- a proxy/debug subset is useful for metadata validation, but not sufficient for final click-to-place authoring

So the tool should reuse the same chunk manifest and tile placement rules, but run them through a **tool-specific scene and tool-safe world loader**.

## Reuse as shared code

These pieces are good candidates to reuse or extract into shared helpers:

- `tile-metadata.ts`
  - keep as the source of truth for tile ids, file names, logical coordinates, starter flags
- `chunking/visioTileChunkManifest.ts`
  - reuse manifest generation and lookup maps directly
- `chunking/visioTileChunkMath.ts`
  - reuse chunk/world coordinate helpers directly
- `chunk-core/*`
  - already renderer-free and reusable
- `chunk-horizon/*`
  - already renderer-free and reusable
- `keyboard-camera-controls.ts`
  - reusable as the baseline fly camera for the tool
- selected `scene.ts` helpers, after extraction into smaller shared files:
  - `loadWorldTile()`
  - `prepareWorldModel()`
  - `createWorldTilePlacementContext()`
  - `getSceneWorldCenterForManifestEntry()`
  - `positionWorldTile()`
  - `disposeWorldModel()`
  - `disposeMaterial()`
  - chunk selection helpers derived from:
    - `createCurrentChunkHorizon()`
    - `getDesiredVisibleChunkKeys()`
    - `getDesiredLoadFiles()`

## Keep runtime-only

These should stay in the runtime experience and not be pulled into the tool core:

- `manifest.ts`
  - current VR experience manifest remains the player-facing runtime entry
- `player.ts`
  - orientation-driven runtime input does not belong in authoring
- `settings.ts`
  - no current authoring value path depends on runtime parameter plumbing
- runtime flight behavior from `scene.ts`
  - `advanceCameraDrift()`
  - steering state
  - bob/drift tuning constants
  - `updatePlayer()` coupling
- runtime debug overlay in `scene.ts`
  - the canvas sprite overlay is specific to runtime streaming status
  - the tool should have its own simpler DOM/HUD overlay later
- catalog registration for `/vr`
  - the tool should not appear as a normal experience yet

## Smallest clean integration path

Use the existing **lab route pattern**, not the experience catalog, for the first launch path.

Recommended first launch path:
- add `src/routes/visio-technologica/lab/placement-tool/+page.svelte`
- keep the route file tiny
- have it render a dedicated authoring page/component that boots the tool scene

Why this is the smallest clean path:
- matches existing Visio lab pages
- keeps the authoring tool out of the normal VR experience catalog
- avoids fake `updatePlayer` / `applySettings` plumbing just to satisfy `ExperienceManifest`
- lets the tool use mouse + keyboard freely without the runtime shell assumptions

Only after the tool is stable should we decide whether it also needs a catalog entry or dedicated non-lab route.

## Recommended shared extraction boundary

Do **not** build the tool by importing the current `visio-technologica/scene.ts` directly.
That file currently mixes:
- world setup
- starter tile loading
- streaming lifecycle
- camera placement
- runtime drift behavior
- debug overlay

Instead, extract a small shared world-loading layer that both runtime and tool can call.

Recommended boundary:
- runtime keeps owning player behavior and runtime presentation
- shared code owns tile manifest lookups, GLB loading, placement, streaming state, and disposal
- tool owns authoring markers, raycasting, selection, overlay, export, and tool keyboard commands

## Concrete file plan

### New files under `src/lib/experiences/visio-technologica/tool/`

- `README.md`
  - this audit note
- `index.ts`
  - tool entry barrel for setup/tick/dispose exports
- `scene.ts`
  - tool-only scene assembly; world root + marker root + overlay hooks
- `state.ts`
  - `VisioPlacementToolState` and initialization helpers
- `constants.ts`
  - tool-only tuning values
- `types.ts`
  - shared placement tool types
- `placements.ts`
  - placement record CRUD helpers over in-memory typed records
- `selection.ts`
  - active selection and marker focus state
- `input.ts`
  - mouse/keyboard command mapping for authoring
- `raycast.ts`
  - hit testing against loaded chunk meshes
- `overlay.ts`
  - small authoring HUD model / helpers
- `export.ts`
  - TS copy/export string generation
- `placements-data.ts`
  - typed placement data source for authored records

### Shared support files to introduce outside `tool/`

Keep these small and focused; avoid rebuilding a new framework.

- `world/visioWorldPlacement.ts`
  - placement context + world-space placement helpers extracted from `scene.ts`
- `world/visioWorldModels.ts`
  - GLB load/prepare/dispose helpers extracted from `scene.ts`
- `world/visioWorldStreaming.ts`
  - chunk runtime state + reconcile/load/unload helpers used by runtime and tool
- `world/visioWorldHorizon.ts`
  - current horizon + desired chunk selection helpers

If that feels too granular during implementation, `visioWorldModels.ts` and `visioWorldPlacement.ts` can be merged, but keep each file under the no-godfile target.

## Integration notes for later steps

1. **Step 3** should scaffold a separate tool scene, launched from a lab route.
2. **Step 4** should move reusable world loading out of `visio-technologica/scene.ts` into shared world helpers.
3. Runtime `scene.ts` should then be reduced to:
   - sky setup
   - runtime camera initialization
   - keyboard/runtime movement orchestration
   - calls into shared world streaming helpers
4. Tool `scene.ts` should use the same shared world helpers, but:
   - no drift
   - no runtime player update path
   - no runtime debug sprite overlay
   - yes mouse raycast and placement marker roots
5. Tool disposal must explicitly clean up:
   - keyboard controls
   - renderer event listeners created by the tool host
   - marker meshes/materials/geometries
   - overlay listeners/subscriptions
   - loaded world tile models via shared dispose helpers

## Recommendation summary

Use the **same real chunked world assets**, reuse the **metadata + chunking + keyboard control + extracted world loading helpers**, keep **player/runtime behavior runtime-only**, and launch the first version through a **Visio lab route** instead of the main experience catalog.
