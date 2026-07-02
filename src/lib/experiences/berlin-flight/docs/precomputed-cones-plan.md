# Precomputed Cones — Plan

## Objective

Eliminate all runtime cone recomputation so that cones never pop in/out and never introduce frame-time jitter. Compute each cone's position **exactly once** (when its tile first loads), cache the result to disk, and serve it from cache on all subsequent visits.

---

## Core insight

Current problem chain:

```
Tile loads → compute corners (budgeted over frames) → compute cones (budgeted over frames)
Tile unloads → DELETE cones (POP!)
Tile reloads → recompute corners + cones (delayed reappearance)
```

The fix:

```
Tile loads:
  → check persistent cache
  → HIT:  load cached cones instantly, skip all computation
  → MISS: extract corners + compute cones eagerly, store in cache
  → done, forever

Tile unloads:
  → cones stay in cache, InstancedMesh keeps them visible

Tile reloads:
  → cache hit, cones load instantly, no computation
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  IndexedDB                       │
│  Map<tileUrlHash, CachedConeData[]>              │
└──────────────────┬──────────────────────────────┘
                   │ load / save
        ┌──────────▼──────────┐
        │   BerlinConeCache    │  ← in-memory + persistence
        │   Map<string,        │
        │     BerlinConeVolume[]>│
        └──────────┬──────────┘
                   │ query by player position
        ┌──────────▼──────────────┐
        │   BerlinConeGridRuntime  │ → InstancedMesh
        └─────────────────────────┘
                   │ sends active cones
        ┌──────────▼──────────────┐
        │   BerlinCollisionController │ → coneMask shader attribute
        └─────────────────────────┘
```

### Data flow on first flight (cache miss)

```
load-model event fires for tile
  ↓
Mesh data available in memory
  ↓
BerlinConeCache.get(tileUrl) → miss
  ↓
extractBerlinRoofCornerCandidates(mesh)      ← runs NOW, no budget limit
  ↓
sampleBerlinMeshNeighborhood(...)            ← runs NOW, samples only already-loaded neighbors
  ↓
solveBerlinConeAxisDirection(...)            ← runs NOW
  ↓
CachedConeData[]  ──►  IndexedDB            ← persisted for next run
  ↓
BerlinConeGridRuntime.setActiveCones(...)    ← visible immediately
```

### Data flow on all subsequent flights (cache hit)

```
load-model event fires for tile
  ↓
BerlinConeCache.get(tileUrl) → hit
  ↓
CachedConeData[] reconstructed to BerlinConeVolume[]
  ↓
BerlinConeGridRuntime.setActiveCones(...)    ← visible immediately
  ↓
(nothing more for this tile, ever)
```

---

## Serialization format

`BerlinConeVolume` reconstructed from flat arrays — no THREE.Vector3 objects in storage.

```typescript
interface CachedConeData {
  // Flat array: [tipX, tipY, tipZ, axisX, axisY, axisZ, baseX, baseY, baseZ, ...]
  positions: Float64Array;    // 9 floats per cone
  scalars: Float64Array;      // [radius, height] per cone
  strings: string[];          // [placementPointId, sourceBuildingId, chunkKey, ...] per cone
  coneIndex: Int32Array;      // coneIndex per cone
}
```

~20 bytes per position float + ~16 bytes per scalar + ~80 bytes per string ≈ ~200 bytes per cone. For ~10,000 cones (a full Berlin session): ~2 MB. Trivial for IndexedDB.

---

## New files

### `src/lib/experiences/berlin-flight/cone-cache/storage.ts`

IndexedDB persistence layer.

- `openConeDatabase(): Promise<IDBDatabase>` — opens/creates `BerlinConeCache` db
- `saveTileConeData(tileUrl: string, cones: CachedConeData): Promise<void>`
- `loadTileConeData(tileUrl: string): Promise<CachedConeData | null>`
- `deleteTileConeData(tileUrl: string): Promise<void>`
- `getCachedTileCount(): Promise<number>`
- `clearAllConeData(): Promise<void>`

**Store schema:**
- Database: `BerlinConeCache` (version 1)
- Object store: `tileCones`
- Key: `tileUrl` (string)
- Value: `CachedConeData` (serialized as a structured-clonable object)

IndexedDB's structured clone algorithm handles `Float64Array` and `Int32Array` natively, so no manual JSON serialization is needed.

### `src/lib/experiences/berlin-flight/cone-cache/cache.ts`

In-memory cache with IndexedDB backing.

```typescript
export class BerlinConeCache {
  private readonly cache = new Map<string, BerlinConeVolume[]>();
  private readonly tileUrlsForLoadedMeshes = new Set<string>();
  private readonly db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private lastPrunePosition: THREE.Vector3 | null = null;

  constructor(tileUrlRoot: string);

  /**
   * Called on load-model. Returns cached cones or null.
   */
  async getOrCompute(
    tileUrl: string,
    mesh: THREE.Mesh,
    meshes: readonly TrackedTileMesh[],
  ): Promise<BerlinConeVolume[]>;

  /**
   * Called on dispose-model. Does NOT remove from cache.
   * Only records that the mesh is no longer loaded.
   */
  onTileUnload(tileUrl: string): void;

  /**
   * Prunes cache entries for tiles far from player to bound memory.
   */
  pruneToRadius(playerPosition: THREE.Vector3, radiusMeters: number): void;

  /**
   * Returns all cones within a radius of the player position.
   */
  query(playerPosition: THREE.Vector3, radiusMeters: number): BerlinConeVolume[];

  dispose(): void;
}
```

**Prune policy:** Remove cached cone data for tiles whose bounding sphere center is > 3,000m from the player. This prevents unbounded growth while keeping cones stable during normal flight.

---

## Modified files

### `scene.ts` — Simplified tick path

**Before:**
```
tick()
  → tilesRuntime.update()
  → placementController.update()         ← heavy, depends on mesh version
  → conePlacementController.update()     ← heavy, depends on placement
  → coneRuntime.setActiveCones()         ← triggers mesh rebuild
  → collisionController.update()         ← mask write
```

**After:**
```
tick()
  → tilesRuntime.update()                ← tile streaming, unchanged
  → coneRuntime.update(playerPosition)   
      → coneCache.query(playerPosition, VISIBLE_RADIUS)
      → rebuild InstancedMesh from cached cones
      → passes active cones to collision
  → collisionController.update()         ← mask write, unchanged
```

The entire `PlacementController → ConePlacementController` chain is removed from `tick()`. Cones come from cache.

The `tilesRuntime` no longer needs to expose `getTrackedTileMeshVersion()` for cone purposes (collision still needs it).

**Computation hook** — added to the `load-model` event path:
```
handleLoadModel(event) 
  → meshRegistry.trackTileScene(...)     ← unchanged
  → coneCache.getOrCompute(tileUrl, mesh, trackedMeshes)
```

### `cone-placement/controller.ts` — Simplified or removed

If cones are entirely cache-driven, the per-frame `ConePlacementController` becomes unnecessary. The corridor logic that decides which accepted points get cones can either:

**Option A:** Keep a lightweight version that merely feeds cone data from cache to the runtime (thin adapter, ~50 lines).

**Option B:** Remove entirely — `BerlinConeGridRuntime` queries the cache directly.

Recommended: **Option A** — keep the file but strip it to a cache query adapter that filters cones by visibility radius and feeds them to the grid runtime. This keeps the architectural boundary clean.

### `runtime/cone-grid-runtime.ts` — Cache-driven, incremental

**Change:** Query the persistent cache by player position instead of receiving a pre-computed cone set.

```typescript
export class BerlinConeGridRuntime {
  // ...
  private coneCache: BerlinConeCache;

  public update(playerPosition: THREE.Vector3): void {
    const cones = this.coneCache.query(
      playerPosition,
      BERLIN_CONE_GRID.VISIBLE_RADIUS_TILES,
    );
    this.setActiveCones(cones, ++this.cacheVersion);
  }

  // rebuildMesh becomes incremental:
  // if cone count grew → add new instances
  // if cone count shrunk → only if player moved > 500m
  private rebuildMesh(): void { /* ... */ }
}
```

The aggressive rebuild on every change is softened: the cache is additive (tiles load, cones appear) and near-prunes only when the player moves very far.

### `runtime/tiles-runtime.ts` — Wire up cache hook

Add a reference to `BerlinConeCache` so that `handleLoadModel` can trigger eager computation.

```typescript
private readonly coneCache: BerlinConeCache;

private readonly handleLoadModel = (event: TileLoadEvent): void => {
  this.meshRegistry.trackTileScene(event.scene, event.url);
  // Trigger eager cone computation (async, no frame budget)
  this.coneCache.getOrCompute(event.url, event.scene, ...).catch(() => {});
};
```

---

## First-flight vs subsequent-flight behavior

### First flight (cold cache)

| What | When | Cost |
|------|------|------|
| Tile streams in | Normal tile loading | Network latency |
| Corner extraction | `load-model` handler, same tick | ~0.1-0.5ms per mesh |
| Neighborhood sampling | `load-model` handler, after extraction | ~0.5-3ms per mesh (spread across tile loads) |
| Direction solving | Same tick | ~0.01ms per cone |
| Write to IndexedDB | `load-model` handler, after compute | Async, non-blocking |

Tile loads are already distributed over many frames by the 3D Tiles renderer (download queue of 8, parse queue of 2). Each tile's cone computation adds < 5ms of CPU time **during an already-asynchronous event** — no frame impact.

### Subsequent flights (warm cache)

| What | When | Cost |
|------|------|------|
| Cache lookup | `load-model` handler | ~0.01ms (Map.get) |
| Deserialize cones | Same tick | ~0.1ms (Float64Array → Vector3) |
| InstancedMesh update | `tick()` | Same as current `rebuildMesh()` |

No cone computation at all. Cones appear the same frame the tile loads.

---

## Memory bounds

| Resource | Bound |
|----------|-------|
| In-memory cache | ~10,000 cones @ 200 bytes ≈ 2 MB |
| IndexedDB storage | ~10,000 cones @ 200 bytes ≈ 2 MB |
| Prune radius | 3,000m from player |
| Max tiles cached | ~400 tiles (Berlin Mitte coverage) |

IndexedDB is not evicted between sessions. A user who explores 400 tiles on day one returns on day two to instant cones.

---

## Error handling

- **IndexedDB unavailable (private browsing, quota)**: Fall back to per-session in-memory cache only. Cones are computed once per session but not persisted. Graceful degradation — same behavior as today but without the pop-in.
- **Corrupt cache entry**: Catch on deserialization, delete corrupt entry, recompute fresh.
- **Quota exceeded during save**: `saveTileConeData` catches `DOMException`, logs warning, continues with in-memory cache.

---

## Order of implementation

1. **`cone-cache/storage.ts`** — IndexedDB layer (spec + test first)
2. **`cone-cache/cache.ts`** — `BerlinConeCache` class with getOrCompute, query, prune
3. **`runtime/tiles-runtime.ts`** — Wire cache into `handleLoadModel`
4. **`runtime/cone-grid-runtime.ts`** — Rewrite `update()` to query cache by position
5. **`scene.ts`** — Strip `PlacementController`/`ConePlacementController` from tick, route through cache
6. **`placement/controller.ts`** — Keep for now (potential future use), remove if orphaned
7. **`cone-placement/controller.ts`** — Strip to cache-query adapter or remove
8. **Test on Quest** — Verify no pop-in, no frame drops, cache survives reload

Steps 1-7 can be parallelized: 1+2 together, then 3-7 in parallel (disjoint write scopes).

---

## Migration path

The cache is **additive** — it can be introduced alongside the existing system. Implement as follows:

1. Add cache and wire it up
2. Both systems active: cache populates during normal flight, but `ConeGridRuntime` still reads from the old chain
3. Switch `ConeGridRuntime` to read from cache
4. Remove old chain once cache is verified stable on Quest

This way, if something goes wrong, the old system is still intact.
