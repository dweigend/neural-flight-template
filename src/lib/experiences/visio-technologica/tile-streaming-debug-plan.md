# Visio Technologica Tile Streaming Debug Plan

Goal: fix the issue where only the 4 starter tiles remain visible, regardless of camera position.

This plan is designed to be used with a coding agent in **three phases**:
1. **Data collection**
2. **Finding the problem**
3. **Fixing the problem**

The prompts below are intentionally recursive: after each phase, update the next prompt with the evidence you gathered so the agent can narrow the search instead of re-investigating from scratch.

---

## Phase 1 — Data collection

Objective: gather concrete runtime evidence before changing more code.

### What we want to learn

We need to determine at least these things:
- whether tiles are being **loaded but placed somewhere unexpected**
- whether they are **unloaded immediately after loading**
- whether the **focus point** is stuck near the starter area
- whether the **camera position** and **focus point** disagree
- whether the **tile world positions** are wrong
- whether the logical grid is correct but the world-space placement is wrong

### Step-by-step guide

#### Step 1: reload and capture baseline logs
Open the experience, reload it fresh, and copy the first 15–30 console lines related to Visio Technologica.

Look especially for lines like:
- `starter tiles ready`
- `focus ... streamed`
- any load/unload related logs
- any GLTF/Three.js warnings or errors

Provide the full snippet to the coding agent.

---

#### Step 2: capture what the overlay says
When the scene is running, note the debug overlay values:
- loaded tile count
- remaining tile count
- whether it says `starter` or `streaming`

If possible, send a screenshot.

This tells us whether the app *believes* more tiles are loaded than are actually visible.

---

#### Step 3: collect camera and visible-scene screenshots
Take at least 3 screenshots:
1. initial spawn view
2. after moving the camera to another area
3. after rotating to look in a very different direction

If only the same 4 tiles are visible in all 3, mention that explicitly.

---

#### Step 4: ask a coding agent to add temporary debug logs
Use this prompt:

> Inspect `src/lib/experiences/visio-technologica/scene.ts` and add **temporary debug instrumentation only** for tile streaming diagnosis. Do not change streaming behavior yet. Log the following whenever chunk reconciliation runs:
> - camera position
> - chunk focus point
> - chosen focus tile id
> - loaded tile count
> - loaded starter tile ids
> - loaded non-starter tile ids count
> - any tile ids unloaded during that pass
> - any tile ids loaded during that pass
> Also add a one-time startup log of the world-space position for each starter tile and the computed scene-focus point for each starter tile. Keep types explicit and changes isolated to `src/lib/experiences/visio-technologica/scene.ts`.

After the agent applies that instrumentation:
- reload the experience
- move the camera a little
- copy the first 20–40 relevant log lines
- send those logs back into the next prompt

---

#### Step 5: if needed, ask for in-scene visual markers
If logs alone are unclear, use this prompt:

> Add temporary debug visualization to `src/lib/experiences/visio-technologica/scene.ts` for tile streaming analysis only. Render small visible markers for:
> - current chunk focus point
> - each loaded tile's scene focus point
> - starter tile centers in a distinct color
> Keep the visualization lightweight and easy to remove later. Do not change load/unload behavior yet.

Then collect:
- a screenshot with markers visible
- the console logs from the same run

---

#### Step 6: package the evidence
Before moving to Phase 2, gather this bundle:
- first 15–30 startup logs
- 20–40 logs after movement
- screenshot(s)
- overlay counts
- note describing whether non-starter tiles ever become visible

This bundle should be pasted into the next coding-agent prompt.

---

## Phase 2 — Finding the problem

Objective: use the collected evidence to identify the root cause before changing behavior.

### Common likely causes

Based on the current implementation, likely root causes include:
- focus chunk selection not tracking the actual player/camera location correctly
- tile `sceneFocusPoint` values being wrong after world rotation or placement
- tiles loading successfully but being placed outside the visible region
- world-step scaling producing incorrect tile spacing relative to chunk focus
- mismatch between logical-grid proximity and actual world-space tile placement
- chunk reconciliation loading tiles correctly but never choosing the visible neighborhood

### Step-by-step guide

#### Step 1: give the evidence bundle to a coding agent
Use this prompt:

> Inspect `src/lib/experiences/visio-technologica/scene.ts` using the runtime evidence below. Do not fix code yet unless a tiny debug-only addition is required to prove a hypothesis. Analyze the current tile streaming control flow and determine the most likely root cause of this symptom: only the 4 starter tiles are visible no matter where the camera moves. Use the evidence to evaluate at least these hypotheses:
> 1. incorrect chunk focus point
> 2. wrong tile world placement
> 3. tiles load but appear far away
> 4. loaded tile visibility differs from loaded tile state
> 5. logical-grid distance does not match world-space adjacency
> Return:
> - the most likely root cause
> - 1–3 alternative hypotheses still worth checking
> - the exact functions/lines most responsible
> - the smallest next diagnostic or code change that would confirm the diagnosis
>
> Evidence:
> [PASTE COLLECTED LOGS, SCREENSHOTS DESCRIPTION, AND OVERLAY DATA HERE]

---

#### Step 2: if the agent is uncertain, narrow the search
If the result is inconclusive, follow up with a recursive prompt that includes the previous findings.

Use this template:

> Based on your previous analysis, narrow the search to the top unresolved hypothesis only: `[INSERT HYPOTHESIS]`. Propose one additional temporary instrumentation change in `src/lib/experiences/visio-technologica/scene.ts` that will decisively confirm or reject it. Do not fix behavior yet. After proposing it, explain exactly what runtime output I should collect and feed back to you.

Then:
- apply the instrumentation
- run again
- collect the requested output
- feed it back into the next follow-up prompt

---

#### Step 3: produce a diagnosis summary
Once the root cause is clear, ask the coding agent for a diagnosis summary.

Use this prompt:

> Summarize the confirmed root cause of the Visio Technologica tile streaming issue in 5–10 bullet points. Include which runtime evidence confirmed it, which hypotheses were ruled out, and which functions in `src/lib/experiences/visio-technologica/scene.ts` need to change. Do not implement the fix yet.

Save that summary and use it in Phase 3.

---

## Phase 3 — Fixing the problem

Objective: implement the smallest correct fix based on the confirmed diagnosis.

### Step-by-step guide

#### Step 1: ask for a targeted fix plan
Use this prompt:

> Implement a targeted fix for the confirmed Visio Technologica tile streaming root cause in `src/lib/experiences/visio-technologica/scene.ts`. Base the fix strictly on this diagnosis summary:
>
> [PASTE DIAGNOSIS SUMMARY HERE]
>
> Requirements:
> - fix the root cause, not just the symptom
> - preserve the existing starter-tile bootstrapping unless the diagnosis proves it is wrong
> - keep types explicit
> - keep changes minimal and local where possible
> - remove or gate temporary debug instrumentation unless it is still useful
> - after editing, run `bunx svelte-check --threshold warning` and `bunx biome check --write` on touched files
> Return:
> - what changed
> - why it fixes the bug
> - any residual risks or assumptions

---

#### Step 2: if the first fix only partially works, iterate recursively
If the bug changes but is not fully resolved, use a follow-up prompt that includes:
- what improved
- what still fails
- the new runtime logs/screenshots

Use this template:

> The previous fix partially improved the issue, but it is not fully resolved. Update your previous diagnosis using this new evidence and make the smallest next change. Do not restart the investigation from scratch; build on the earlier findings.
>
> Previous diagnosis summary:
> [PASTE SUMMARY]
>
> Previous fix summary:
> [PASTE AGENT SUMMARY]
>
> New evidence:
> [PASTE NEW LOGS / SCREENSHOT NOTES / OVERLAY COUNTS]

This recursive follow-up is important. It keeps the agent focused on the narrowed hypothesis instead of reopening the whole search.

---

#### Step 3: validate the final behavior
After the fix lands, confirm all of the following:
- starter tiles remain visible when expected
- non-starter tiles become visible as the camera moves
- loaded tile count and visible tile count roughly agree
- focus logs correspond to the area you are actually near
- no new Three.js or GLTF errors appear

Use this prompt:

> Validate the Visio Technologica tile streaming fix. Run `bunx svelte-check --threshold warning` and `bunx biome check --write` for the touched files, then summarize what I should verify manually in the browser to confirm that chunk focus, tile loading, and tile visibility now behave correctly.

---

## Recommended working style with a coding agent

### Rule 1: do not jump to fixes too early
Always finish Phase 1 evidence gathering before making large streaming changes.

### Rule 2: update later prompts with real evidence
Do not reuse the prompts verbatim without inserting:
- logs
- screenshots descriptions
- overlay counts
- prior diagnosis summaries

### Rule 3: keep debug changes temporary
Instrumentation and markers should either be removed at the end or put behind a simple debug flag.

### Rule 4: prefer smallest proof-driven changes
Ask the coding agent to confirm one hypothesis at a time.

---

## Quick copy-paste prompts

### Prompt A — instrumentation only
> Inspect `src/lib/experiences/visio-technologica/scene.ts` and add temporary debug instrumentation only for tile streaming diagnosis. Do not change behavior yet. Log camera position, chunk focus point, chosen focus tile id, loaded tile count, loaded starter tile ids, non-starter loaded count, and tile ids loaded/unloaded during reconciliation. Also log starter tile world positions and scene focus points once at startup.

### Prompt B — analyze evidence
> Inspect `src/lib/experiences/visio-technologica/scene.ts` using the runtime evidence below. Determine the most likely root cause of only the 4 starter tiles being visible. Evaluate incorrect focus, wrong world placement, invisible loaded tiles, and logical-grid/world-space mismatch. Do not fix yet unless a tiny debug-only addition is needed.

### Prompt C — targeted fix
> Implement a targeted fix in `src/lib/experiences/visio-technologica/scene.ts` based strictly on the confirmed diagnosis summary below. Keep changes minimal, explicit, and local. Remove or gate temporary debug instrumentation. Run `bunx svelte-check --threshold warning` and `bunx biome check --write` on touched files.

---

## Final note

If you want the cleanest debugging loop, Phase 1 should happen first and produce evidence before any additional structural streaming changes are made. That will make Phase 2 far more reliable and Phase 3 much smaller.
