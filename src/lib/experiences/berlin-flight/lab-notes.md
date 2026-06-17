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

---
## Phase-1 technical guardrails
### Performance
- target **WebXR + WebGL** first
- keep the hosted test area small
- avoid per-frame allocations where possible
- use early exits in update and visibility logic
- expect aggressive culling and modest LOD settings

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
## Open questions for the next step
1. Which candidate runtime has the best maintenance and API fit for modern Three?
2. Which option gives the cleanest explicit disposal path?
3. Can it load Cesium ion-hosted tiles without introducing CesiumJS `Viewer`?
4. What is the minimum Berlin Mitte extent needed for a reliable smoke test?
5. Should token handling live in this folder later, or come from an existing config boundary?

---
## Working conclusion
For Berlin Mitte phase 1:
- **Cesium ion-hosted 3D Tiles** are the source
- **Three.js** is the renderer
- **WebXR + WebGL** is the target platform
- **WebGPU is deferred**
- runtime evaluation begins with **`3d-tiles-renderer`** behind `runtime/tiles-runtime.ts`

If the next evaluation step shows poor maintenance, compatibility, or VR performance, we should reassess before building deeper experience scaffolding.
