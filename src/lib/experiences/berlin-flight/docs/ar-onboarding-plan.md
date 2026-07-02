# Berlin Flight — AR Passthrough Onboarding Plan

## Goal

Start **Berlin Flight** in a single WebXR **`immersive-ar`** session on **PICO 4 Ultra Enterprise** using **PICO Browser**, show real-world passthrough with a **head-locked overlay** for onboarding, then over **4 seconds** fade into a fully covered virtual scene and begin flight plus experience audio.

This is only for:

- experience: `berlin-flight`
- route: `/vr`
- browser target: `PICO Browser`

If AR passthrough is unsupported, the app must:

- show an error
- refuse entry

---

## Why The Device Check Matters

This feature depends on **browser-level** support for `navigator.xr.requestSession("immersive-ar")`, not just headset marketing that says "mixed reality".

The headset may support MR in native apps and still not expose `immersive-ar` in its browser WebXR stack.

So the first gate is runtime capability detection on the actual device:

```ts
await navigator.xr?.isSessionSupported?.("immersive-ar");
```

If that resolves to `false`, this plan stops there and the app shows a blocking error state.

---

## Constraints

- keep one WebXR session
- no VR session handoff
- no plane detection
- no anchors
- no room-locked content
- no passthrough pixel processing
- no onboarding for experiences other than `berlin-flight`
- flight input ignored during onboarding
- audio shifts during the fade

---

## Technical Reality

`immersive-ar` passthrough is compositor-driven. The real-world image sits behind the transparent WebGL output. We can:

- render transparent or semi-transparent virtual content
- head-lock UI and effects
- gradually cover passthrough with opaque virtual rendering

We cannot:

- read the passthrough camera pixels
- run shader effects on the real camera image itself

So "phase into VR" here means:

1. start with transparent scene output
2. render head-locked overlay/UI
3. increase virtual opacity / scene coverage over time
4. begin motion + full audio once the fade completes

---

## Chosen UX

### Startup

When `berlin-flight` is selected on `/vr`:

1. check `immersive-ar` support
2. if unsupported, show blocking error text in DOM and do not create XR entry button
3. if supported, create **AR** entry button instead of VR button
4. enter one `immersive-ar` session

### Onboarding Phase

Duration: **4 seconds** default

During onboarding:

- passthrough visible
- user remains stationary
- flight controls ignored
- head-locked overlay visible
- experience audio starts in onboarding mix/state
- Berlin world is present but visually restrained and not yet fully opaque

### Transition

Across 4 seconds:

- overlay animates in/out
- virtual fog/background cover ramps up
- scene materials/effects ramp toward full opacity
- onboarding audio crossfades to full experience audio

### Post-Transition

After 4 seconds:

- onboarding overlay removed or fully hidden
- full Berlin flight visuals active
- flight input enabled
- normal Berlin update loop continues

---

## Smallest Viable Architecture

Keep the current ownership model:

- one `/vr` page
- one `THREE.WebGLRenderer`
- one `renderer.setAnimationLoop`
- existing experience loader

Add the minimum new pieces:

### 1. XR session mode switch in `/vr`

`src/routes/vr/+page.svelte`

- detect active experience id before creating XR button
- if experience is `berlin-flight`, probe `immersive-ar`
- create `ARButton` with transparent renderer path
- otherwise keep current `VRButton`

This is the right place because session ownership already lives here.

### 2. Berlin onboarding state

Add lightweight onboarding state under `src/lib/experiences/berlin-flight/`:

- `onboarding/` helpers or one small helper file
- timer/progress tracking
- enabled/disabled flag
- audio transition state

### 3. Berlin visual coverage control

Berlin needs one shared progress value from `0 -> 1`:

- `0`: passthrough-first
- `1`: full virtual coverage

That progress should drive:

- overlay opacity
- fog/background/cover meshes
- material opacity where needed
- audio mix
- input lock/unlock

Do not scatter separate timers across files.

### 4. Head-locked overlay attached to camera rig

Attach overlay content to the Berlin player rig/camera so it stays head-locked.

Likely simplest form:

- `THREE.Group`
- a few planes/sprites/textures
- no DOM overlay dependency inside XR

Keep it minimal and cheap.

---

## Recommended File Scope

### Must change

- `src/routes/vr/+page.svelte`
- `src/lib/experiences/berlin-flight/scene.ts`
- `src/lib/experiences/berlin-flight/types.ts`
- `src/lib/experiences/berlin-flight/manifest.ts`

### Likely add

- `src/lib/experiences/berlin-flight/onboarding/controller.ts`
- `src/lib/experiences/berlin-flight/onboarding/overlay.ts`
- `src/lib/experiences/berlin-flight/onboarding/audio.ts`

Keep these tiny. If one file stays under ~150 LOC, fewer files is better.

---

## Runtime Model

### Renderer setup

For Berlin AR onboarding:

- `renderer.xr.enabled = true`
- renderer created with `alpha: true`
- do not clear to opaque background during AR onboarding

For non-Berlin experiences:

- keep current VR path

### Session mode

Use `ARButton.createButton(renderer, options)` for Berlin only.

Optional `domOverlay` is not required for the core design because the onboarding content is head-locked 3D content, not HTML UI.

### Input gating

During onboarding:

- ignore speed input
- ignore orientation-driven flight updates

Head tracking still updates naturally through XR; only gameplay movement is blocked.

### Audio gating

During onboarding:

- start onboarding sound bed or muted/low-intensity Berlin audio
- crossfade to full flight mix over 4 seconds

If there is no structured audio system yet, add one Berlin-local gain/progress hook instead of designing a global audio framework.

---

## Visual Implementation Strategy

Take the lazy route first:

### Phase 1 visual recipe

At onboarding progress `p`:

- overlay opacity: high -> 0
- black/atmospheric cover opacity: 0 -> 1
- Berlin scene opacity/intensity: low -> full

Minimal options:

1. head-locked intro planes
2. one or more camera-facing fade planes
3. fog/atmosphere ramp

This is enough to create the dramaturgic effect without inventing passthrough image processing.

Do not start with:

- plane detection
- room meshing
- occlusion
- anchors
- gesture-driven onboarding

---

## Blocking Error State

If `immersive-ar` is unsupported for `berlin-flight`:

- show clear error text before XR entry
- do not fall back to VR
- do not silently switch modes

Suggested message:

> Berlin Flight requires browser AR passthrough support on this device and cannot start here.

This satisfies the requested behavior and keeps failure obvious.

---

## Implementation Order

## Phase 0 — Capability Gate

Add Berlin-only `immersive-ar` support detection in `/vr`.

Deliverables:

- Berlin selected -> probe support
- unsupported -> blocking error UI
- supported -> AR button shown

Success check:

- non-Berlin experiences still show VR button

## Phase 1 — Transparent AR Session

Make the renderer/session path work for Berlin in AR mode.

Deliverables:

- transparent renderer config for Berlin AR path
- AR session enters successfully

Success check:

- passthrough visible behind canvas on supported device

## Phase 2 — Onboarding State

Add one Berlin onboarding controller with:

- start time
- duration `4000ms`
- progress `0..1`
- `isActive`
- `isComplete`

Success check:

- progress advances in render loop

## Phase 3 — Head-Locked Overlay

Add simple head-locked onboarding visuals.

Success check:

- overlay follows headset view
- no world-lock drift

## Phase 4 — Input Lock

Suppress Berlin gameplay motion until onboarding completes.

Success check:

- user can look around
- flight does not start early

## Phase 5 — Visual Cover Ramp

Use onboarding progress to move from passthrough-first to virtual-first rendering.

Success check:

- by `p=1`, passthrough is effectively hidden by virtual content

## Phase 6 — Audio Transition

Fade onboarding sound state into full experience sound state over the same progress.

Success check:

- audio shift is tied to the same timer, not a separate one

## Phase 7 — Cleanup

Dispose overlay objects, materials, textures, and audio handles in Berlin dispose path.

Success check:

- session exit/re-entry does not duplicate overlay or leak objects

---

## Risks

### 1. Highest risk: PICO Browser may not support `immersive-ar`

If unsupported, the feature is blocked by platform capability.

### 2. Scene coverage may not feel like true VR

Because this stays in `immersive-ar`, the "full VR" endpoint is still composited AR. The solution is to cover passthrough visually, not to change session type.

### 3. Existing Berlin materials may not expose easy opacity control

If so, use one or two head-locked/fullscreen cover layers plus fog ramps first. Do not refactor every material just to get the initial effect.

### 4. Audio system may not be centralized

Keep audio handling local to Berlin rather than inventing a repo-wide audio abstraction.

---

## Minimal Acceptance Criteria

- selecting `berlin-flight` on `/vr` probes `immersive-ar`
- unsupported devices show blocking error and refuse XR entry
- supported devices get AR session entry
- passthrough is visible at start
- head-locked onboarding overlay runs for 4 seconds
- flight input is disabled during onboarding
- audio transitions during the same 4-second window
- Berlin visuals end in a fully covered virtual presentation
- non-Berlin experiences remain unchanged

---

## Out of Scope

- generic AR support for all experiences
- Quest-specific code paths
- native PICO app integration
- passthrough pixel filters
- plane detection / anchors / scene understanding
- editable onboarding timeline UI
- settings plumbing for onboarding duration

`4s` stays hardcoded first. Add configurability only when the timing stabilizes.
