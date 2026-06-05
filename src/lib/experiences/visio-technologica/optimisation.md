Yes — the current implementation is very likely stalling because of load cost, not because the experience logic is fundamentally broken.

## What I found

In `src/lib/experiences/visio-technologica/scene.ts`, startup currently does this:

- loads **all 18 tiles before the experience can finish setup**
- each tile is an **OBJ + MTL + multiple JPG textures**
- then computes bounds and rewrites geometry on all of them

And the asset set is huge:

- `src/lib/experiences/visio-technologica/static`: **1.2 GB**
- total asset files: **122**
- total OBJ lines: **22,999,346**

That is extremely heavy for blocking startup in the browser.

---

## Top 4 optimizations to implement first

These are the four measures with the best combined impact on **startup time**, **runtime smoothness**, and **practical implementation value** for this scene.

---

### 1. Load only a small starter subset first, then stream the rest in
**Impact:** very high  
**Risk:** low  
**Priority:** do this first

Instead of waiting for all 18 tiles in `setup()`, change startup so it:

- loads 1–4 central tiles first
- returns from `setup()` as soon as the starter set is ready
- loads the remaining tiles progressively afterward

### Why this helps
Right now `setup()` blocks the whole experience. This makes the scene become interactive much sooner and shifts the remaining cost out of the critical startup path.

### Tradeoff
- the world appears progressively
- start position and camera framing may need to depend on the starter subset or metadata

### Step-by-step implementation guide
1. **Inspect current loading flow**
   - Ask the coding agent to trace `src/lib/experiences/visio-technologica/scene.ts` and identify:
     - where all tiles are discovered
     - where tile assets are awaited
     - where setup currently blocks until everything is loaded
   - Ask for a short summary before changing code.
   - **Prompt:** “Inspect `src/lib/experiences/visio-technologica/scene.ts` and map the current tile-loading flow. Show me where the full tile list is built, where asset loading is awaited, and exactly where `setup()` blocks on all tiles before the experience becomes interactive. Do not change code yet—just summarize the current control flow and likely bottlenecks.”
2. **Introduce a starter tile list**
   - Define an explicit first-pass list such as the 4 central tiles.
   - Keep the list deterministic so testing is repeatable.
   - **Prompt:** “Add a deterministic starter tile subset for `visio-technologica`, ideally the 4 central tiles. Keep the full tile list intact, but introduce a clear separation between starter tiles and deferred tiles so later streaming logic can use it. Keep the naming and types explicit.”
3. **Split setup into two phases**
   - Phase 1: load only the starter tiles and finish scene setup.
   - Phase 2: queue remaining tiles to load incrementally after the scene is already running.
   - **Prompt:** “Refactor the Visio Technologica scene setup into two phases: phase 1 should load only the starter tiles and complete enough setup for the scene to become interactive; phase 2 should queue the remaining tiles for later loading without blocking initial setup. Preserve existing scene behavior as much as possible.”
4. **Stream remaining tiles safely**
   - Load one tile at a time or in very small batches.
   - Insert them over multiple frames or async ticks so main-thread stalls are reduced.
   - Keep cleanup and disposal logic intact for partially loaded scenes.
   - **Prompt:** “Implement incremental streaming for the deferred Visio Technologica tiles. Load one tile at a time, or very small batches, using async scheduling so the main thread is not blocked for long stretches. Make sure partially loaded scenes still clean up correctly and no resources are leaked if the experience is destroyed mid-load.”
5. **Add lightweight progress visibility**
   - At minimum, add a simple loaded/remaining counter in logs or state so you can verify streaming behavior.
   - **Prompt:** “Add lightweight progress visibility for Visio Technologica tile streaming. At minimum, expose how many tiles are loaded and how many remain, either through logs or internal scene state, so we can verify that initial tiles load first and the rest stream in afterward.”
6. **Test stage**
   - Run `bunx svelte-check --threshold warning`
   - Run `bunx biome check --write .`
   - Start the app and verify:
     - the scene becomes interactive before all tiles finish loading
     - late-loading tiles appear progressively
     - no obvious flicker, missing transforms, or duplicate tiles
   - **Prompt:** “Validate the starter-subset plus streaming refactor. Run `bunx svelte-check --threshold warning` and `bunx biome check --write .`, then summarize any code issues. Also tell me what I should verify manually in the browser to confirm the scene becomes interactive before all tiles finish loading and that progressive tile insertion behaves correctly.”
7. **Commit stage**
   - Commit after this lands cleanly.
   - Suggested commit message: `feat(visio-technologica): stream tiles after initial scene startup`
   - **Prompt:** “Prepare this change for commit. Give me a short summary of what changed, list the files touched, and suggest a commit message for the starter-subset and progressive streaming implementation.”
8. **Coding-agent prompt to use**
   - “Refactor `src/lib/experiences/visio-technologica/scene.ts` so setup loads only a small starter subset of tiles first, returns control once those are ready, and then streams the remaining tiles incrementally without blocking startup. Preserve cleanup behavior and keep types explicit.”

---

### 2. Convert the assets from OBJ/MTL/JPG to GLB
**Impact:** extremely high  
**Risk:** medium  
**Priority:** best long-term loading win

OBJ+MTL is one of the slowest possible asset pipelines here:

- text parsing is expensive
- many separate file requests are required
- binary packing is missing
- runtime loading is inefficient compared with GLB

### Why this helps
- far fewer file requests
- faster parsing
- better material bundling
- much better Three.js loader path
- easier future compression and chunking

### Tradeoff
- requires an offline conversion/export step
- asset output needs validation for scale, material fidelity, and orientation

### Step-by-step implementation guide
1. **Audit the current asset set**
   - Ask the coding agent to list how many tile folders, OBJ files, MTL files, and textures exist under `src/lib/experiences/visio-technologica/static`.
   - Ask it to identify naming patterns so conversion can be scripted consistently.
2. **Choose the conversion pipeline**
   - Prefer a repeatable offline conversion process, not manual exports one by one.
   - Decide whether each tile becomes one `.glb` or whether a later merge step will combine tiles.
3. **Create a conversion script or documented workflow**
   - Have the coding agent add a script or `README` instructions for converting OBJ/MTL assets to GLB.
   - Make sure the workflow preserves transforms, materials, and texture paths.
4. **Convert a single representative tile first**
   - Use one central tile as a proof of concept.
   - Load that tile in the scene and verify appearance, orientation, and scale.
5. **Update the runtime loader**
   - Replace OBJ/MTL loading code with a GLB/GLTF loader path.
   - Keep the old path only if you intentionally want a temporary fallback.
6. **Expand from one tile to all tiles**
   - Once one tile works, convert the rest in bulk.
   - Keep naming conventions stable so tile lookup code stays simple.
7. **Test stage**
   - Run `bunx svelte-check --threshold warning`
   - Run `bunx biome check --write .`
   - Manually compare before/after on:
     - startup time
     - total requests in DevTools
     - visual correctness of materials/textures
     - browser memory behavior during initial load
8. **Commit stage**
   - Commit the pipeline work separately from runtime refactors if possible.
   - Suggested commit message: `refactor(visio-technologica): switch tile assets from obj-mtl to glb`
9. **Coding-agent prompt to use**
   - “Help me replace the Visio Technologica OBJ/MTL tile pipeline with a GLB-based pipeline. First document or script the conversion path, then update the runtime loader in `src/lib/experiences/visio-technologica/scene.ts` to load GLB tiles with explicit TypeScript types.”

---

### 3. Use a chunked distance-based loader
**Impact:** high  
**Risk:** medium  
**Priority:** best architectural fix for large worlds

Only load tiles near the player/camera and unload distant ones.

### Why this helps
Even after startup is improved, rendering the whole scan at once may still be too expensive. Chunked loading improves both runtime smoothness and memory usage.

### Tradeoff
- more loading logic is required
- tile metadata is needed
- visible pop-in must be controlled carefully

### Step-by-step implementation guide
1. **Define the chunking rule**
   - Prefer **single-tile chunks** for the current Visio Technologica asset set.
   - Define separate **load** and **unload** radii from the start so the system has explicit hysteresis.
   - Keep the current central starter tiles in mind as a protected bootstrap subset for startup.
   - **Prompt:** “Design a chunk-loading strategy for `visio-technologica`. Assume the current world remains one GLB per tile. Recommend whether chunks should stay single-tile or be grouped, define separate load and unload radii, and explain how the starter tile set should behave during startup.”
2. **Add tile metadata**
   - Store per-tile identifiers and source-space center positions in a lightweight manifest.
   - This manifest should be readable without loading the full geometry.
   - Do **not** assume the raw metadata coordinates are already normalized tile steps.
   - **Prompt:** “Add a lightweight tile metadata manifest for Visio Technologica that can be read without loading geometry. Include stable tile identifiers and source-space center positions needed for distance-based loading, and keep the data format simple and explicit.”
3. **Normalize the tile grid before applying radii**
   - Derive a **logical tile grid** with contiguous indices from the raw metadata centers.
   - Use the logical grid for neighborhood checks, load radius, unload radius, and hysteresis.
   - Preserve the raw metadata values unchanged for stability and traceability.
   - **Prompt:** “Build a logical tile-grid mapping for Visio Technologica from the raw tile metadata. Preserve the original metadata values, but derive contiguous logical grid indices so load and unload radii operate on adjacent tiles instead of source-space coordinate gaps.”
4. **Track the correct runtime focus position**
   - Do not blindly use `camera.position` if the camera is offset behind or above the visible city.
   - Derive a chunk-loader focus point from what the player is actually looking at, such as the camera look direction projected onto the tile plane.
   - Only reevaluate the loader when that focus point has moved enough to matter.
   - **Prompt:** “Find the best runtime chunk-focus source in the current Visio Technologica runtime. Account for the startup camera being offset from the visible world by projecting the camera look direction onto the tile plane, and only trigger chunk reevaluation when that focus point moves by a meaningful threshold.”
5. **Implement load/unload orchestration**
   - Load nearby tiles asynchronously.
   - Unload far tiles and dispose of geometry, materials, and textures correctly.
   - Keep explicit chunk state such as `unloaded`, `loading`, `loaded`, and `unloading`.
   - Seed the chunk state map with the already-loaded starter tiles instead of treating everything as initially unloaded.
   - **Prompt:** “Implement the distance-based load/unload orchestration for Visio Technologica. Load nearby chunks asynchronously, unload distant chunks with correct Three.js disposal for geometry, materials, and textures, maintain explicit chunk state such as unloaded, loading, loaded, and unloading, and initialize the starter tiles as already loaded.”
6. **Prevent visual instability**
   - Keep hysteresis explicit by maintaining separate desired **load** and **retained** tile sets.
   - Limit how many new chunks can start loading during a single streaming cycle.
   - Be careful not to discard the initially visible starter tiles just because the chunk focus calculation is wrong.
   - **Prompt:** “Stabilize the distance-based loader so it does not thrash or cause obvious pop-in spikes. Keep separate desired load and retained tile sets for hysteresis, limit how many new chunks can begin loading during a single update cycle, and make sure the initial visible starter tiles are not discarded due to incorrect focus selection.”
7. **Test stage**
   - Run `bunx svelte-check --threshold warning`
   - Run `bunx biome check --write .`
   - Manually test by moving through the world and checking:
     - starter tiles remain visible after startup
     - the active chunk focus matches the visible center of the scene, not just the raw camera position
     - neighboring tiles load ahead of movement or gaze direction
     - distant tiles unload cleanly without repeated load/unload loops
     - frame pacing is better than the fully loaded version
   - Use logs or a debug overlay to inspect:
     - active tile id
     - load set size vs retained set size
     - reevaluation count
   - **Prompt:** “Validate the distance-based tile streaming implementation. Run `bunx svelte-check --threshold warning` and `bunx biome check --write .`, summarize any issues, and give me a manual test checklist that specifically verifies starter tiles do not disappear at startup, focus selection matches the visible world, tiles load ahead of movement, and no repeated unload loops occur.”
8. **Commit stage**
   - Commit this as its own feature because it changes runtime behavior significantly.
   - Suggested commit message: `feat(visio-technologica): add distance-based tile streaming`
   - **Prompt:** “Prepare the distance-based loader work for commit. Summarize the behavior change, list the touched files, and suggest a clean commit message for the new chunked streaming system.”
9. **Coding-agent prompt to use**
   - “Implement a distance-based tile loader for `src/lib/experiences/visio-technologica`. Use explicit tile metadata, derive a logical tile grid from raw centers, choose chunk focus from the visible look target rather than only raw camera position, load nearby tiles asynchronously, unload distant tiles with proper Three.js disposal, and avoid load/unload thrashing.”

---

### 4. Merge all tiles into one or a few optimized scene files offline
**Impact:** extremely high  
**Risk:** medium  
**Priority:** strong production optimization, especially after GLB conversion

Instead of many tile folders, create:

- one combined world GLB
- or a small number of regional GLB chunks

### Why this helps
- fewer file requests
- simpler runtime loading logic
- easier camera framing and spawn setup
- easier to optimize later with chunking or LOD

### Tradeoff
- requires preprocessing
- one giant file may hurt flexibility, so a few larger regional chunks are often better than one monolith

### Step-by-step implementation guide
1. **Decide on merge granularity**
   - If the world is mostly experienced as one continuous area, test a small number of regional merged files.
   - Avoid immediately jumping to one single giant asset unless profiling clearly supports it.
2. **Prepare merged exports offline**
   - Ask the coding agent to help define the merge workflow and file naming convention.
   - Preserve world-space positioning so runtime transforms remain simple.
3. **Update the loader contract**
   - Replace per-tile lookup assumptions with regional asset lookup.
   - Keep the runtime code focused on loading a few large assets rather than many tiny ones.
4. **Validate memory and startup tradeoffs**
   - Compare merged regions versus per-tile GLBs.
   - If one giant merged file causes large spikes, split into 2–6 regional chunks.
5. **Retain future compatibility with chunking**
   - If possible, align merged regions with the chunk boundaries you would later use for distance loading.
6. **Test stage**
   - Run `bunx svelte-check --threshold warning`
   - Run `bunx biome check --write .`
   - In browser profiling, compare:
     - request count
     - time to first interactive scene
     - peak memory during load
     - smoothness during camera movement
7. **Commit stage**
   - Commit asset restructuring separately from gameplay/runtime logic when possible.
   - Suggested commit message: `perf(visio-technologica): merge world tiles into regional scene assets`
8. **Coding-agent prompt to use**
   - “Help me restructure Visio Technologica assets so the world loads from one or a few merged scene files instead of many tile folders. Focus on a repeatable offline workflow, simple runtime lookup, and compatibility with later chunk-based streaming.”

---

## Recommended implementation order

### Phase 1 — immediate startup improvement
1. **Load a small starter subset first, then stream the rest in**
2. Commit and test before touching the asset pipeline

### Phase 2 — biggest loading pipeline improvement
3. **Convert OBJ/MTL/JPG to GLB**
4. Commit and test with one representative tile first, then all tiles

### Phase 3 — scaling the world for smooth runtime performance
5. **Use a chunked distance-based loader**
6. Commit and test movement through the world

### Phase 4 — production asset consolidation
7. **Merge tiles into one or a few optimized scene files offline**
8. Commit and test request count, startup time, and runtime smoothness again

---

## Suggested validation checklist for every phase

After each optimization phase:

1. Run `bunx svelte-check --threshold warning`
2. Run `bunx biome check --write .`
3. Launch the scene and record:
   - time until the scene becomes interactive
   - total network requests for world assets
   - whether frame pacing feels smoother on startup
   - whether memory spikes are reduced
4. Commit only after the scene still loads correctly and visuals remain acceptable

---

## Recommendation

If you want the best practical path, implement the four optimizations in this order:

1. **Starter subset + streaming**
2. **GLB conversion**
3. **Distance-based chunk loading**
4. **Offline merge into a few optimized regional scene files**

That sequence gives you a fast unblock first, then addresses the deeper asset-pipeline and runtime-scaling issues in the order most likely to produce meaningful wins.