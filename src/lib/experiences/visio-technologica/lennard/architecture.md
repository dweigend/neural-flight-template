# Architecture — `lennard/` Submodule

> Personal workspace of **Lennard Lev** inside the `visio-technologica` experience.
> Contains experimental road-network + car-fleet logic, tooling scripts, and a
> stand-alone lab route to iterate on the system in isolation.

---

## 1. Purpose & Scope

The parent experience `visio-technologica/` is a streamed GLB-tile world with
keyboard-driven flight controls. Lennard's submodule adds a **procedural road
network and traffic simulation** on top of the tile grid.

The submodule is intentionally **self-contained**: it can be tested in a
throwaway SvelteKit route (`/lab/strassen`) without booting the full VR
flight stack, and it can later be wired back into `scene.ts` with minimal
changes.

```
visio-technologica/
├── index.ts              ← public re-export
├── manifest.ts           ← experience contract
├── scene.ts              ← streamed GLB tiles + camera + flight physics
├── player.ts             ← orientation → steering
├── settings.ts           ← parameter handling
├── tile-metadata.ts      ← tile grid + lookup tables
├── keyboard-camera-controls.ts
├── optimisation.md       ← perf write-up
├── 3d assets/            ← optional GLB swaps
├── static/               ← streamed tile GLBs
└── lennard/              ← ◀ THIS SUBMODULE
    ├── architecture.md   (you are here)
    ├── straßen/          ← road + car simulation
    └── scripts/          ← git tooling
```

---

## 2. Module Layout

### 2.1 `lennard/straßen/` — Road Network + Traffic

A small simulation layer. Everything is pure TypeScript + Three.js, no
Svelte / SvelteKit imports, so it can be dropped into any route.

| File | Role |
|------|------|
| `road-network-types.ts` | `RoadNode`, `RoadEdge`, `RoadGraph` interfaces — the only shared vocabulary. |
| `road-config.ts` | Frozen tuning constants (`CAR_COUNT`, `CAR_SPEED`, `ROAD_WIDTH`, …). Single source of truth. |
| `road-graph.ts` | `buildRoadGraph(tiles)` — turns a list of `TileInfo` (id + grid center + world position) into a `RoadGraph` by adding 4-neighbour edges. |
| `road-renderer.ts` | `renderRoadNetwork()` / `disposeRoadNetwork()` — builds one asphalt box + lane markers per edge, with correct `dispose()`. |
| `car.ts` | `Car` entity: mesh, spawn, edge-following movement, next-edge picker. |
| `car-fleet.ts` | `createCarFleet(graph, count)` — creates the fleet, owns the `carGroup` + `roadGroup`, exposes `update(delta, graph)` and `dispose()`. |
| `plan.md` | Living checklist of phases, integration TODOs, known issues. |

Naming note: the folder is `straßen` (German for "roads") — `ß` is a valid
filename character on Windows. Keep the import path as written.

### 2.2 `lennard/scripts/` — Overlays & Tooling

#### Cyber Overlay

`cyber-overlay.ts` — Full text-grid overlay system with canvas-to-sprite
rendering, translation dictionary, responsive layout, and glow effects.
Configured via the `CYBER` settings object.

#### Sonar Overlay

`sonar-overlay.ts` — A radar-sweep HUD rendered as a camera-aligned
`THREE.Sprite`. Features a rotating scan line with trailing glow wedge,
animated ambient dots, concentric rings, a center crosshair, and a
unified ring of radial tick marks.

| Setting | Default | Purpose |
|---------|---------|---------|
| `tickCount` | 36 | Total ticks around the circle (every 10°) |
| `tickInnerRadiusFrac` | 0.85 | Tick start radius as fraction of outer circle |
| `tickMinorLength` | 12 | Shortest ticks |
| `tickMajorLength` | 20 | Medium ticks (every 30°) |
| `tickMajor2Length` | 32 | Longest ticks (every 60°) |
| `tickMajorInterval` | 3 | Every Nth tick is medium |
| `tickMajor2Interval` | 6 | Every Nth tick is longest |
| `tickMinorColor` | `"#008866"` | Minor tick colour |
| `tickMajorColor` | `"#00ffcc"` | Medium tick colour |
| `tickMajor2Color` | `"#ff44aa"` | Longest tick colour |
| `rotationSpeed` | 20 | Scan line rotation (deg/s) |
| `glowAngleDeg` | 80 | Sweep wedge angular width |
| `dotCount` | 15 | Ambient dots that activate on scan pass |
| `fadeOutDuration` | 1.3 | Fade-out animation length (s) |
| `fadeOutPeakScale` | 1.2 | Scale multiplier at peak before shrinking |
| `fadeOutPeakTimeFrac` | 0.45 | When peak occurs (0–1) |

**Data flow:**

```
SonarOverlay.constructor()    ← create canvas + texture + sprite
       │
       ▼
SonarOverlay.attachToCamera() ← camera.add(sprite)
       │
       ▼ (every frame)
SonarOverlay.update()         ← advance scanAngle, activate dots
       │
       ▼
  _draw()                     → full canvas redraw → texture.needsUpdate
```

#### Sequence Controller

`sequence-controller.ts` — Runs an ordered series of overlay stages with
staggered pop-in, text-switching, and blink effects. Orchestrates
`SonarOverlay`, `CyberOverlay`, and `BatteryOverlay` instances.

| Setting | Default | Purpose |
|---------|---------|---------|
| `staggerSeconds` | 0.3 | Delay between each overlay appearing |
| `staggerFadeSeconds` | 0.3 | Fade-in duration per overlay |
| `staggerFadeOutSeconds` | 0.2 | Fade-out old text before switching |
| `staggerRandomOrder` | true | Randomize overlay reveal order |
| `sonarFadeOutDelay` | 1.5 | Pause after sonar vanishes before next stage |
| `blinkOnDuration` | 0.3 | How long blink overlays stay visible |
| `blinkOffDuration` | 0.1 | How long blink overlays stay hidden |

**Stages (in order):**

1. `sonar` — Radar sweep HUD, 20 s
2. `cyber` — "HUMAN PERCEPTION DETECTED", 10 s
3. `cyber` — "SWITCHING TO TECHNOLOGICAL PERCEPTION", 6 s
4. `battery` — Countdown battery icon, 50 s
5. `blink` — "TURNING OFF TECHNOLOGICAL PERCEPTION" blinking grid, 4 s

**Transition rules:**
- Same factory (cyber → cyber): overlays kept, text swapped with stagger.
- Different factory (cyber → battery): stagger fade-out, then new factory loads.
- Sonar → next: sonar does grow-shrink animation, waits `sonarFadeOutDelay`, then advances.
- Blink: all overlays toggle opacity simultaneously at `blinkOnDuration` / `blinkOffDuration` intervals.

**Data flow:**

```
SequenceController.start()     ← begins stage 0
       │
       ▼ (every frame)
SequenceController.update(delta)
       │
       ├─ active._sonar?.update()   ← sonar scan line
       ├─ active._battery?.update()  ← battery countdown
       ├─ applyStagger()             ← cyber pop-in / switch / fade
       └─ advanceToNext()            ← on stage end
```

#### Battery Overlay

`battery-overlay.ts` — A canvas-drawn battery icon HUD rendered as a
camera-aligned `THREE.Sprite`. Displays remaining time as 4 bars that
deplete at 25% intervals, with a flicker effect on the last bar.

**Behaviour:**
- Bars (4→0) disappear at 25%, 50%, 75% of total time elapsed.
- At 95% elapsed the remaining bar flickers (`flickerColor`).
- `start()` begins the countdown; `update(now)` drives per-frame state.

#### Tooling

- `git-hourly-push.ps1` — PowerShell snippet referenced by the
  Windows Scheduled Task `NeuralFlight-GitPush-ll` defined in
  `AGENTS.md`. Runs `git push origin ll` and tees the output into
  `push.log` for debugging cron runs.
- `push.log` — Append-only log of the last push attempt. Committed
  intentionally so failures are visible in git history.

---

## 3. Data Flow

```
VISIO_TECHNOLOGICA_TILE_METADATA         ◀── tile-metadata.ts
            │
            │  (lab route: hard-coded STEP=80; production: derive from tilePlacement)
            ▼
        TileInfo[]            (id, center, worldPosition)
            │
            ▼
      buildRoadGraph()        ◀── road-graph.ts
            │
            ▼
       RoadGraph               (nodes: Map<id, RoadNode>, edges: RoadEdge[])
            │
            ├──────────────────────────────┐
            ▼                              ▼
    renderRoadNetwork()            createCarFleet()
            │                              │
            ▼                              ▼
        roadGroup : THREE.Group         carGroup : THREE.Group
            │                              │
            └──────────┬───────────────────┘
                       ▼
              scene.add(roadGroup, carGroup)
                       │
                       ▼
   renderer.setAnimationLoop(() => fleet.update(delta, graph))
```

### Tick contract

`car-fleet.update(delta, graph)` is the only hot path. It iterates the
`cars[]` array and delegates to `updateCar`, which advances `progress`
along the current edge, picks a new `targetNodeId` on arrival, and
repositions the mesh.

---

## 4. Type Contracts

```ts
// road-network-types.ts
interface RoadNode {
  id: string;                   // = tile id
  position: THREE.Vector3;      // world-space
  connections: string[];        // neighbour ids
}
interface RoadEdge { from: string; to: string; }
interface RoadGraph {
  nodes: Map<string, RoadNode>;
  edges: RoadEdge[];
}

// car.ts
interface Car {
  mesh: THREE.Group;
  currentNodeId: string;
  targetNodeId: string;
  progress: number;             // 0..1 along current edge
  speed: number;
  color: number;
}

// car-fleet.ts
interface CarFleet {
  cars: Car[];
  carGroup: THREE.Group;
  roadGroup: THREE.Group;
  update(delta: number, graph: RoadGraph): void;
  dispose(): void;
}
```

`RoadGraph` is the boundary between graph construction (`road-graph.ts`)
and everything else. Consumers should never need to know how the graph
was built — only its shape.

---

## 5. Integration Plan (see `straßen/plan.md` for the checklist)

Phase 3 is the wiring step. Today the submodule is only used in the lab
route. The target state:

1. `scene.ts::setup()` computes a `WorldTilePlacementContext` (it already
   does). Pass that context to `buildRoadGraph()` so road nodes land on
   the **real** tile world positions instead of the lab's `STEP=80` grid.
2. After `addWorldModels()`, call `createCarFleet(graph, ROADS.CAR_COUNT)`
   and stash the returned `CarFleet` on `VisioTechnologicaState`.
3. In `tick()`, call `fleet.update(ctx.delta, graph)` once per frame.
4. In `dispose()`, call `fleet.dispose()`.

When `RuntimeConfig` is extended, `CAR_COUNT` and `CAR_SPEED` should
become steerable parameters in `manifest.ts` + `settings.ts`.

---

## 6. Performance Notes (Quest 72 fps target)

- Today each edge produces **one road mesh + `LANE_MARKER_STEP` marker
  meshes**. For the 4×4 starter grid this is fine; at full 17-tile
  density it must be consolidated.
- Cars are individual `Group`s. Phase 6 in `plan.md` calls for
  `InstancedMesh` migration once the car GLB is locked in.
- `dispose()` is wired for both roads and cars (geometries + materials,
  single + array forms). Follow the pattern when adding new meshes.
- Avoid per-frame allocations: `car.ts::updateCarPosition` currently
  creates fresh `Vector3` / `Quaternion` instances each call. A small
  refactor to module-level scratch vectors is a cheap win before
  moving to `InstancedMesh`.

---

## 7. Conventions

- All tunables live in `road-config.ts` — no magic numbers in `.ts`
  files (mirrors the parent `lib/config/flight.ts` rule).
- `dispose()` is mandatory for any new mesh / texture / material.
- `road-graph.ts` is grid-agnostic: it does not know about GLBs, tiles,
  or Three.js materials. Keep it that way so the same graph can drive
  visual, physics, and AI layers.
- Test changes in `/lab/strassen` before touching `scene.ts`.
- Commit only when asked (see `AGENTS.md`); hourly push is automated.

---

## 8. Open Questions / Known Gaps

- Real tile positions are not yet piped from `scene.ts` → `buildRoadGraph`
  (Phase 3 in `plan.md`).
- Cars are placeholder boxes (`createCarMesh`); GLB swap is Phase 4.
- Road graph is undirected and ignores `isStarter` / non-tile areas —
  fine for the lab, but will need filtering for the real streaming
  world (don't lay asphalt on unloaded tiles).
- No LOD / culling for roads; relies on the parent tile-streaming
  system to gate everything via `activeFocusTileFile`.
