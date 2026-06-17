# Visio Technologica Placement Tool — Implementation Guide

This guide describes how to build a dedicated placement tool scene with **click-to-place**, **keyboard editing**, and **typed placement data**.

The tool is meant for **development only** and must **not** ship as part of the user-facing experience.

---

## Goal

Build a separate authoring tool under `src/lib/experiences/visio-technologica/` that:

- loads the Visio Technologica world or a suitable authoring subset
- lets you manage many placements (`200–300` expected)
- supports editing:
  - position
  - rotation
  - FOV
- supports both:
  - mouse interaction
  - keyboard fine-tuning
- exports placements into a typed source file
- stays modular, with **no godfiles**

---

## Global implementation rules

Include these constraints in **every coding-agent prompt**:

- **No godfiles** (keep files around or below `200` LOC for ease of maintenance)
- **Early exit coding style for performance**
- Use **explicit TypeScript types**
- Do **not** use `any`
- Use existing project patterns and dependencies first
- Add cleanup paths for event listeners, renderer loops, and Three.js resources
- Run `bunx biome check --write .` before each commit
- Make **regular commits** after each completed step

Suggested reusable prompt suffix:

```text
Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Recommended folder structure

Keep the placement tool in a dedicated subtree.

```text
src/lib/experiences/visio-technologica/
  tool/
    index.ts
    scene.ts
    state.ts
    placements.ts
    selection.ts
    input.ts
    raycast.ts
    overlay.ts
    export.ts
    constants.ts
    types.ts
```

Optional later:

```text
    persistence.ts
    filters.ts
    shortcuts.ts
```

### Suggested responsibility split

- `index.ts` — tool entry point, wires setup/tick/dispose
- `scene.ts` — scene objects used only by the tool
- `state.ts` — runtime state shape + initialization helpers
- `placements.ts` — typed placement records + CRUD helpers
- `selection.ts` — active placement selection and marker focus
- `input.ts` — keyboard/mouse state and command mapping
- `raycast.ts` — hit testing against world geometry
- `overlay.ts` — small authoring HUD / text overlay
- `export.ts` — generate TS output string for copy/export
- `constants.ts` — tool-only tuning values
- `types.ts` — shared types

---

## Proposed data model

Use a typed TS source file for persistence.

Example target file:

`src/lib/experiences/visio-technologica/tool/placements-data.ts`

```ts
export interface ShaderPlacementRecord {
  id: string;
  label: string;
  shaderType: "point" | "wireframe" | "texture" | "custom";
  position: [number, number, number];
  rotationDeg: [number, number, number];
  fovDeg: number;
}

export const VISIO_SHADER_PLACEMENTS: ShaderPlacementRecord[] = [];
```

Why this format:

- easy to diff in git
- type-safe
- easy to import into runtime code later
- easier to scale than constants in `scene.ts`

---

## Interaction model for v1

### Mouse
- click geometry: place selected origin on surface hit point
- click marker: select placement
- optional modifier later: place with normal offset

### Keyboard
- `[` / `]` or `,` / `.`: cycle selected placement
- arrow keys / `WASD` / `QE`: nudge position
- `IJKL` + `UO`: rotate selected placement
- `-` / `=`: decrease/increase FOV
- `Shift`: coarse movement
- `Alt`: fine movement
- `N`: create placement
- `Backspace`: delete placement
- `C`: copy current placement as TS
- `E`: copy full placement array as TS

### Overlay
Show:
- selected id / label
- position
- rotation
- FOV
- current mode help
- dirty state

---

## Step-by-step implementation plan

Each step includes:
- objective
- files
- checks
- a ready-to-use coding-agent prompt

---

## Step 1 — Audit and design the tool boundary

### Objective
Inspect the current `visio-technologica` loading flow and define what world data the tool should load for authoring.

Decide:
- whether the tool should load the same chunked world as the experience
- or a reduced authoring subset for responsiveness
- where the tool will be registered / launched from

### Files to inspect
- `src/lib/experiences/visio-technologica/index.ts`
- `src/lib/experiences/visio-technologica/scene.ts`
- `src/lib/experiences/visio-technologica/manifest.ts`
- `src/lib/experiences/visio-technologica/chunking/*`
- `src/lib/experiences/visio-technologica/tile-metadata.ts`

### Checks
- Can the tool reuse world loading logic without pulling user-facing runtime behavior into the tool?
- Is there a clean launch path for a separate authoring scene?
- Is there already a pattern for debug-only or lab-only experiences?

### Coding-agent prompt
```text
Audit the visio-technologica experience and design the boundary for a separate placement authoring tool under src/lib/experiences/visio-technologica/tool/. Identify which existing scene/chunk loading pieces can be reused, which should stay runtime-only, and propose the smallest clean integration path for a separate tool scene. Do not implement yet; produce a concrete file plan and integration notes.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 2 — Create shared tool types and constants

### Objective
Add the basic typed foundation for the authoring tool.

### Files to create
- `tool/types.ts`
- `tool/constants.ts`
- `tool/placements-data.ts`
- `tool/placements.ts`

### Implement
- placement record types
- selection ids / helper types
- tool tuning constants
- empty placement list
- helper functions:
  - create placement
  - clone placement
  - update placement transform
  - update FOV
  - serialize placement values

### Checks
- All files stay small and single-purpose
- No runtime behavior yet
- Types are reusable by later modules
- No `any`

### Coding-agent prompt
```text
Implement the typed data foundation for the visio-technologica placement tool under src/lib/experiences/visio-technologica/tool/. Create small modules for shared types, tool constants, placement data storage, and placement CRUD/update helpers. Use a typed TS data file for persistence and keep all files modular and around or below 200 LOC.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 3 — Scaffold the separate tool entrypoint

### Objective
Create a separate tool experience entry that can be launched independently of the user-facing experience.

### Files to create
- `tool/index.ts`
- `tool/state.ts`

### Implement
- tool `setup`, `tick`, and `dispose`
- runtime state interface
- hook points for scene, input, overlay, and export
- make sure the tool is isolated from production experience behavior

### Checks
- The tool has a clear independent lifecycle
- It can be launched without affecting `visio-technologica/scene.ts`
- `dispose()` is present from the start

### Coding-agent prompt
```text
Create the separate placement tool entrypoint for visio-technologica under src/lib/experiences/visio-technologica/tool/. Implement a small, isolated experience-style lifecycle with setup, tick, and dispose, plus a typed runtime state module. Keep this tool fully separate from the user-facing experience and do not add authoring behavior to the production scene.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 4 — Reuse world loading in a tool-safe scene module

### Objective
Load the world geometry into the authoring tool without dragging in unnecessary runtime behavior.

### Files to create
- `tool/scene.ts`

### Possible supporting edits
- small extraction from `visio-technologica/scene.ts` into reusable helpers if needed

### Implement
- load world tiles or authoring subset
- create a tool-only root group
- create simple visual references:
  - grid
  - optional axes
  - optional helper lighting if needed
- expose raycastable meshes

### Checks
- World content renders in the tool
- Scene code is separate from production runtime behavior
- Any extraction from the main scene is minimal and reusable
- No file grows into a godfile

### Coding-agent prompt
```text
Implement a tool-only scene module for the visio-technologica placement tool that reuses existing world loading logic where appropriate but stays isolated from production runtime behavior. The tool scene should load raycastable geometry, create a tool root group, and add lightweight authoring references like a grid. If extraction from the current visio-technologica scene is necessary, keep it minimal and modular.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 5 — Add placement markers and selection state

### Objective
Render editable placement markers and support selecting one placement at a time.

### Files to create
- `tool/selection.ts`

### Possible edits
- `tool/state.ts`
- `tool/scene.ts`

### Implement
- create marker meshes for all placements
- color/style selected vs unselected
- selection by id
- marker refresh when placements change
- helper functions:
  - select next
  - select previous
  - select by marker hit

### Checks
- Markers render for placement data
- Selected placement is visually obvious
- Selection updates do not leak meshes or materials

### Coding-agent prompt
```text
Add placement marker rendering and selection state to the visio-technologica tool. Implement a small selection module plus any required state wiring so the tool can show many placements, visually distinguish the active one, and switch selection by id or marker hit. Keep marker lifecycle and cleanup explicit.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 6 — Implement raycast click-to-place

### Objective
Allow clicking world geometry to place the currently selected origin.

### Files to create
- `tool/raycast.ts`

### Possible edits
- `tool/input.ts`
- `tool/state.ts`
- `tool/scene.ts`

### Implement
- pointer normalization
- raycaster setup
- raycast against scene geometry
- click marker to select placement
- click geometry to move selected placement
- update marker position after placement

### Checks
- Clicking a marker selects it
- Clicking the world moves the selected placement
- Miss clicks early-exit cleanly
- No unnecessary per-frame raycasts

### Coding-agent prompt
```text
Implement raycast-based click-to-place behavior for the visio-technologica placement tool. Add a focused raycast module that supports selecting markers by click and placing the active placement onto world geometry hits. Avoid continuous expensive work; use event-driven raycasts where possible and early exits on misses or invalid state.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 7 — Implement keyboard editing for position, rotation, and FOV

### Objective
Add fast keyboard-based editing for the selected placement.

### Files to create
- `tool/input.ts`

### Possible edits
- `tool/state.ts`
- `tool/selection.ts`
- `tool/constants.ts`

### Implement
- input state tracking
- position nudge controls
- rotation controls
- FOV increment/decrement
- fine and coarse adjustment modifiers
- create/delete/duplicate shortcuts if useful

### Checks
- Selected placement can be fully edited without the mouse
- Controls are responsive but not overly sensitive
- Input cleanup occurs on dispose
- Input paths use early exits for unrelated keys

### Coding-agent prompt
```text
Implement keyboard editing for the visio-technologica placement tool. Add small input modules so the selected placement can be nudged in position, edited in rotation, and adjusted in FOV, with fine and coarse modifiers. Use early exits for unrelated key events and keep input cleanup explicit in dispose.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 8 — Add a minimal authoring overlay

### Objective
Display the active placement values and shortcut help in a small tool-only overlay.

### Files to create
- `tool/overlay.ts`

### Implement
- selected id / label
- position readout
- rotation readout
- FOV readout
- dirty state
- condensed shortcut legend

### Checks
- Overlay is readable but lightweight
- Overlay updates when selection or values change
- Overlay cleanup happens on dispose
- Overlay is not coupled to production UI

### Coding-agent prompt
```text
Add a minimal tool-only overlay for the visio-technologica placement tool. Show the active placement identity, position, rotation, FOV, dirty state, and key shortcuts. Keep the overlay implementation lightweight, modular, and isolated from production UI concerns.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 9 — Add export helpers for copy/paste workflow

### Objective
Make it easy to export one placement or all placements into a typed TS string.

### Files to create
- `tool/export.ts`

### Possible edits
- `tool/input.ts`
- `tool/overlay.ts`

### Implement
- serialize current placement as TS object text
- serialize full placement array as TS module text
- wire keyboard shortcuts:
  - `C` for current placement
  - `E` for full export
- if clipboard is awkward in current environment, fall back to a visible export panel/string

### Checks
- Exported text is valid TypeScript-ready output
- Copy/export path does not mutate state
- Failures have clear user-visible feedback

### Coding-agent prompt
```text
Implement copy/export helpers for the visio-technologica placement tool. Add a small export module that can serialize the current placement and the full placement list into typed TypeScript-ready output, and wire it to keyboard shortcuts or a simple fallback UI if clipboard access is inconvenient. Keep export logic pure and separate from rendering/input concerns.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 10 — Wire the tool into a launch path

### Objective
Make the authoring tool easy to open during development while keeping it out of the user experience.

### Possible files to edit
- `src/lib/experiences/visio-technologica/index.ts`
- `src/lib/experiences/visio-technologica/manifest.ts`
- relevant app-level routing/experience registration files discovered in Step 1

### Implement
Choose one:
- register as a separate internal experience
- expose a dev-only manifest entry
- add a lab-only launch path if there is already a `lab/` pattern

### Recommended entry workflow
Preferred approach for this project:
- register the tool as a **separate development-only experience**
- give it a clear internal name such as `Visio Technologica Placement Tool`
- make it selectable from the existing experience launcher or internal experience picker
- keep it hidden from the public/user-facing experience catalog

Expected day-to-day workflow after implementation:
1. run the app locally in development
2. open the normal experience launcher / internal experience selection flow
3. choose `Visio Technologica Placement Tool`
4. edit placements in the tool scene
5. export the current placement or full placement set
6. paste or sync the exported data back into the typed placements source file

Fallback options if the current app architecture makes that easier:
- a lab-only launcher entry
- a dev-only route or query-param launch path

### Checks
- The tool is reachable in development through a clear, repeatable entry path
- The default entry path is a separate dev-only experience or equivalent internal tool launcher
- It is clearly separated from production experience flow
- Users do not encounter it accidentally

### Coding-agent prompt
```text
Wire the visio-technologica placement tool into a development-only launch path. Reuse existing experience registration or lab/debug patterns if available, and keep the tool clearly separated from the user-facing experience so it cannot appear accidentally in production usage.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Step 11 — Manual validation and quality pass

### Objective
Validate the end-to-end authoring workflow.

### Test checklist
- launch tool successfully
- world geometry loads
- placement markers render
- click marker selects correctly
- click geometry repositions selected placement
- keyboard edits affect position/rotation/FOV correctly
- overlay updates correctly
- export current placement works
- export all placements works
- tool cleans up without lingering listeners or scene objects

### Commands
```bash
bunx biome check --write .
bunx svelte-check --threshold warning
```

### Coding-agent prompt
```text
Run a focused validation pass on the visio-technologica placement tool. Verify the full authoring workflow manually in code and through available checks, fix issues that are clearly caused by the recent implementation, and report any remaining limitations or follow-up work. Keep fixes modular and avoid broad refactors.

Constraints for this task:
- No godfiles (keep files around or below 200 LOC for ease of maintenance)
- Use early exit coding style for performance
- Use explicit TypeScript types and never use any
- Reuse existing project patterns before introducing new abstractions
- Add cleanup/dispose logic for everything you create
- Run bunx biome check --write . before committing
- Make a regular git commit when this step is complete
```

---

## Suggested commit rhythm

Use frequent small commits. Example cadence:

1. `feat(visio-tool): add placement tool types and constants`
2. `feat(visio-tool): scaffold authoring tool lifecycle`
3. `feat(visio-tool): load authoring world geometry`
4. `feat(visio-tool): add placement markers and selection`
5. `feat(visio-tool): add raycast click-to-place`
6. `feat(visio-tool): add keyboard transform editing`
7. `feat(visio-tool): add authoring overlay`
8. `feat(visio-tool): add TS export helpers`
9. `feat(visio-tool): register dev-only launch path`
10. `chore(visio-tool): validate and polish authoring workflow`

---

## Phase 2 ideas after v1 works

Only do these after the v1 workflow is stable:

- duplicate placement shortcut
- group/filter/search placements
- surface normal offset placement
- snap increments for position/rotation/FOV
- local autosave cache
- import existing export text back into the tool
- marker visibility culling for large placement counts
- chunk-aware editing filters

---

## Non-goals for v1

Do not add these yet unless they become necessary:

- full `TransformControls`
- runtime player integration
- user-facing UI polish
- direct in-browser file writing
- VR-native editing
- large refactors of `visio-technologica/scene.ts`

---

## Definition of done for v1

The first implementation is done when:

- there is a separate development-only placement tool under `visio-technologica/tool/`
- the tool loads the relevant world geometry
- a selected placement can be positioned by mouse click
- position, rotation, and FOV can be adjusted via keyboard
- current values are visible in an overlay
- placements can be exported as typed TS-ready output
- the code stays modular with no godfiles
- cleanup is complete and validation passes

---

## Suggested first execution order

If you want the shortest path to something usable:

1. Step 1
2. Step 2
3. Step 3
4. Step 4
5. Step 5
6. Step 6
7. Step 7
8. Step 9
9. Step 8
10. Step 10
11. Step 11

This order gets placement and export working slightly earlier, then improves usability with the overlay.
