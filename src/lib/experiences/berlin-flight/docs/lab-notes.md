# Berlin Flight — Lab Notes
## Purpose
Capture the agreed technical direction for the Berlin Mitte experience.

This file complements `integration-plan.md` and preserves the current phase-1 decision record.

---
## Agreed direction
- geographic target: **Berlin Mitte**
- folder scope: `src/lib/experiences/berlin-flight/`
- source of geospatial content: **Cesium ion-hosted 3D Tiles**
- runtime target: **Three.js + WebXR + WebGL**
- render ownership: **one Three scene, one camera owner, one WebXR render loop**

### Explicitly deferred
- **WebGPU**
- CesiumJS `Viewer` as the primary runtime
- full-Berlin coverage
- offline or self-hosted tiles
- perfect collision and realism work

### Phase-1 success criteria
Phase 1 should prove that we can:
1. stream a small Berlin Mitte 3D Tiles area from Cesium ion
2. render it inside the existing Three/WebXR app model
3. keep lifecycle ownership inside `berlin-flight`
4. preserve explicit cleanup and disposal behavior
5. swap loaders later if the first runtime choice underperforms

---
## Why Berlin Mitte first
Berlin Mitte is a good first slice because it is urban, recognizable, and compact.
- dense building content is a realistic stress test
- smaller scope reduces streaming and memory risk
- visual validation is easier than with sparse terrain
- origin, scale, and heading issues should show up quickly

---
## Runtime choice summary
The best current fit is to treat **Cesium ion as the hosted data source** and **Three.js as the renderer**.

This stays aligned with the repo's architecture:
- the existing `/vr` route remains in charge
- the existing flight controller remains the primary interaction model
- WebXR session ownership stays in the app's Three renderer
- integration work can remain modular inside `berlin-flight`

This also avoids dual renderers, dual camera ownership, and Cesium widget lifecycle conflicts.

---
## CesiumJS Viewer vs Three.js runtime for Cesium tiles
### Option A — CesiumJS `Viewer`
**Pros**
- complete geospatial stack out of the box
- first-class 3D Tiles support
- built-in camera, navigation, and streaming behavior

**Cons for this repo**
- conflicts with the existing Three/WebXR ownership model
- likely introduces dual scene and camera responsibilities
- makes isolation to `berlin-flight` harder
- adds more risk for browser-based VR integration

**Conclusion**
Useful as a reference point, but **not the phase-1 renderer**.

### Option B — Render Cesium-produced 3D Tiles inside Three.js
**Pros**
- preserves current app architecture
- keeps one scene graph and one XR render loop
- fits the existing experience modularity model
- is easier to connect to the current flight controller
- gives a better path for VR-focused tuning

**Cons**
- requires selecting and validating a Three-compatible tiles runtime
- needs some geospatial glue code
- disposal and async lifecycle details must be handled carefully

**Conclusion**
This is the **phase-1 target architecture**.

---
## Candidate Three-compatible 3D Tiles runtimes to evaluate next
### Decision: evaluate `3d-tiles-renderer` first
`3d-tiles-renderer` is the first runtime to evaluate for Cesium ion-hosted 3D Tiles because it is purpose-built for rendering 3D Tiles inside Three.js while preserving our WebXR + WebGL ownership model.

Evaluation focus:
- loading Cesium ion-hosted tiles without CesiumJS `Viewer`
- WebXR/browser compatibility
- maintenance and API stability
- explicit disposal for tile-owned resources
- Quest-class performance behavior

Adapter boundary:
- experience code should call the local `runtime/tiles-runtime.ts` interface
- loader-specific imports and setup should stay behind that adapter
- if `3d-tiles-renderer` underperforms, the adapter should allow swapping to another loader without reshaping `scene.ts`

Smoke-test config:
- use `PUBLIC_BERLIN_TILES_URL` for a direct hosted tileset URL, or
- use `PUBLIC_BERLIN_ION_ASSET_ID` with `PUBLIC_CESIUM_ION_TOKEN` to resolve a Cesium ion endpoint
- the first pass loads `3d-tiles-renderer` through the local adapter boundary, not from `scene.ts`

### Alternative 1. `@loaders.gl/tiles` with Three integration glue

Good fallback if we want a more modular parsing and streaming pipeline.

Evaluate:
- how much custom Three glue is required
- whether flexibility is worth the extra complexity
- runtime overhead in headset browsers

### Alternative 2. NASA-AMMOS `3DTilesRendererJS` lineage / package variants
Worth checking because this library family is commonly referenced for Three.js 3D Tiles rendering.

Evaluate:
- which package name is current and maintained
- whether it differs meaningfully from `3d-tiles-renderer`
- whether docs/examples match modern Three versions

### Alternative 3. Custom minimal loader stack
Keep as a last-resort fallback only.

Pros:
- maximum control
- potential for a narrower runtime footprint

Cons:
- highest engineering cost
- highest culling, transform, and cleanup risk

**Decision:** begin implementation experiments behind the local adapter with **`3d-tiles-renderer`**. Keep `@loaders.gl/tiles` as the strongest fallback and consider a custom stack only if packaged options fail.

*Update Phase 3:* Implemented `runtime/tiles-source.ts` and `runtime/tiles-runtime.ts` as the adapter boundary.

---
## Phase-1 technical guardrails
### Performance
- target **WebXR + WebGL** first
- keep the hosted test area small
- avoid per-frame allocations where possible
- use early exits in update and visibility logic
- expect aggressive culling and modest LOD settings

*Update Phase 8:* The Berlin runtime keeps debug tooling opt-in and lazy-created. When the debug overlay is disabled, no canvas texture, sprite, or overlay update path is active. Tile runtime updates still run every frame while visible because screen-space error and tile selection depend on the current VR camera; any future throttling should be guarded by headset testing to avoid visible LOD lag. The debug overlay is intentionally throttled to a low refresh rate and should remain a diagnostic aid, not a default VR feature.

### Lifecycle and cleanup
Every runtime helper created in later phases should expose explicit cleanup:
- stop async work when the scene is torn down
- detach scene objects from parents
- dispose owned geometries, materials, and textures
- release event listeners and timers
- clear references that could pin tile graphs in memory

### Modularity
- keep files small and focused
- avoid a scene-manager godfile
- split geo math, tile runtime, debug helpers, and cleanup helpers early

---
## Current implementation notes

### Behavior now
- Tiles source resolution supports either `PUBLIC_BERLIN_TILES_URL` or Cesium ion asset resolution via `PUBLIC_BERLIN_ION_ASSET_ID` and `PUBLIC_CESIUM_ION_TOKEN`.
- `scene.ts` owns one `BerlinFlightRoot`, a tile root, the flight player rig, and a reference grid.
- `runtime/tiles-runtime.ts` owns `3d-tiles-renderer`, Google tile auth plugin setup, visibility, debug stats, and idempotent disposal.
- Async tile setup is guarded with an `AbortController`; disposed experiences should not attach late tile content.
- The debug overlay is opt-in, lazy-created, throttled, and disposed when disabled or when the experience unloads.
- *Update Phase 9:* Berlin now uses a stricter local tile-runtime profile for the existing WebGL path: `errorTarget` increased from `12` to `20`, sibling prefetch disabled, traversal work capped more tightly, and the tile cache/queue budgets reduced inside `runtime/tiles-runtime.ts` only. One retained non-obvious choice is `loadSiblings = false`: the renderer defaults to sibling prefetch, but Berlin’s current Quest-oriented path keeps it off so fast flight spends less bandwidth and memory on adjacent building tiles that the user is unlikely to inspect before the next camera update.

### Known limitations
- Tile LOD, cache size, and error target are still local first-pass Quest-oriented values and need headset profiling.
- The reference grid is useful for smoke testing but may not belong in the final VR presentation.
- Flight physics are connected, but collision, height constraints, and city-scale navigation tuning are not solved.
- Attribution display for Google/Cesium content is not yet surfaced in the user-facing VR UI.
- Browser/API-key restrictions, billing, and provider quotas remain deployment risks outside this folder.

### Unresolved risks
- Quest-class memory pressure may require stricter tile cache and quality limits.
- Fast VR flight could expose tile popping or request bursts around dense Berlin geometry.
- `3d-tiles-renderer` remains a replaceable runtime until sustained headset tests prove stability.
- Existing project-wide checks can be blocked by unrelated legacy `berlin-flight-old` diagnostics.

### Suggested next steps
1. Run repeated enter/exit tests in the browser and headset to verify no orphaned groups or GPU resources remain.
2. Profile headset FPS, draw calls, tile counts, and memory with debug overlay enabled only during diagnosis.
3. Tune tile quality/cache settings from measured Quest behavior rather than desktop assumptions.
4. Decide whether to remove or gate the reference grid before user-facing demos.
5. Add an attribution/status presentation path if Google Photorealistic Tiles remains the selected data source.
