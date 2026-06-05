# 🤖 AI Development Guide

Instructions for Claude, Copilot, and other AI coding assistants.

---

## Project Context

**ICAROS VR Starter** — WebXR flight simulation for Meta Quest controlled by ICAROS fitness device.

| Stack | Tool |
|-------|------|
| Framework | SvelteKit |
| Runtime | Bun |
| 3D Engine | Three.js |
| VR/AR | WebXR API |
| UI | bits-ui |
| Linting | Biome |
| Type Checking | TypeScript (strict) |

---

## Architecture

```
Controller UI (/controller)
       ↓ WebSocket (pitch, roll, speed, settings)
SvelteKit Server (hooks.server.ts)
       ↓ broadcast
VR Scene (/vr on Quest)
       ↓ FlightPlayer.updateOrientation()
Three.js Render Loop @ 72fps
```

Key directories:
- `src/lib/three/` — 3D world components
- `src/lib/node-editor/` — Visual node editor (Eurorack architecture: Components → Nodes → Canvas)
- `src/lib/config/flight.ts` — All tuning constants
- `src/lib/ws/` — WebSocket client/server
- `src/lib/types/` — TypeScript interfaces

---

## Constraints

### Never

- ❌ Use `any` type
- ❌ Use ESLint/Prettier (use **Biome**)
- ❌ Use `pip` (use **uv** for Python)
- ❌ Top-level Three.js imports without `onMount()`
- ❌ `requestAnimationFrame` (use `renderer.setAnimationLoop`)
- ❌ Forget `dispose()` in `onDestroy`
- ❌ Hardcode values (use `lib/config/flight.ts`)
- ❌ HTTP for WebXR (must be HTTPS)

### Always

- ✅ Explicit TypeScript types
- ✅ `onMount()` for browser APIs
- ✅ `onDestroy()` for cleanup
- ✅ Import config values from `flight.ts`
- ✅ Run `bunx biome check --write .` before committing

---

## Decision Tree

Before writing code:

1. **Does this exist?** → Search codebase first
2. **Built-in solution?** → Check SvelteKit, Three.js, bits-ui
3. **Already installed?** → Check `package.json`
4. **Add dependency?** → Research first, then `bun add`
5. **Custom code** → Last resort

---

## Example Prompts

### Add a New Object

> "Add spinning crystals that spawn above the terrain. Use InstancedMesh for performance. Config values in flight.ts."

### Modify Flight Physics

> "Add momentum to the FlightPlayer so it doesn't stop instantly when braking. Keep arcade feel."

### New WebSocket Message

> "Add a 'boost' command that triples speed for 3 seconds. Add type to orientation.ts, guard to protocol.ts, handler in player.ts."

### UI Component

> "Add a compass indicator to the VR scene using Three.js sprites. Show current heading."

### Performance Issue

> "Frame rate drops below 72fps with VIEW_RADIUS=3. Profile and suggest optimizations."

---

## File Patterns

### Three.js Module

```typescript
// lib/three/example.ts
import * as THREE from "three";
import { CONFIG_VALUE } from "$lib/config/flight";

export function createExample(): THREE.Group {
  const group = new THREE.Group();
  // ... setup using CONFIG_VALUE
  return group;
}
```

### Svelte + Three.js

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setAnimationLoop(tick);
  });

  onDestroy(() => {
    renderer?.setAnimationLoop(null);
    renderer?.dispose();
  });
</script>

<canvas bind:this={canvas}></canvas>
```

### WebSocket Message Type

```typescript
// lib/types/orientation.ts
export interface NewMessage {
  type: "newtype";
  data: SomeData;
  timestamp: number;
}

// lib/ws/protocol.ts
export function isNewMessage(data: unknown): data is NewMessage {
  // Type guard implementation
}
```

---

## Performance Budget

| Metric | Target |
|--------|--------|
| FPS | 72 (Quest refresh) |
| Draw calls | < 100 |
| Triangles | < 500k |
| JS frame time | < 11ms |

Use `InstancedMesh` for repeated geometry. Chunk terrain. Pool objects.

---

## Branch `ll` Workflow

- **Commit nur auf Nachfrage**: Nach jeder Änderung fragen, ob mit Zusammenfassung committed werden soll
- **Push**: Automatisch stündlich via Windows Scheduled Task `NeuralFlight-GitPush-ll`
- **Branch**: `ll` → `origin/ll`

## Testing

```bash
bun run dev                            # Manual testing in browser
bunx biome check --write .             # Lint + format
bunx svelte-check --threshold warning  # Type check
```

No unit tests currently — focus on visual testing in VR.
