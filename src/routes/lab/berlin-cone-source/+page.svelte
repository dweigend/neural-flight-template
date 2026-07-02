<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { buildBerlinConeSourceMeshFile } from "$lib/experiences/berlin-flight/cone-data/source-export";
  import { BERLIN_CONE_GRID } from "$lib/experiences/berlin-flight/runtime/cone-grid-config";
  import { resolveBerlinTilesSource } from "$lib/experiences/berlin-flight/runtime/tiles-source";
  import { TilesRuntimeAdapter } from "$lib/experiences/berlin-flight/runtime/tiles-runtime";

  const CAPTURE_CENTER = { x: 0, z: 0 } as const;
  const CAPTURE_RADIUS_METERS = 1000;

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let tilesGroup: THREE.Group | null = null;
  let tilesRuntime: TilesRuntimeAdapter | null = null;
  let status = $state("Initializing Cesium tiles...");
  let trackedMeshes = $state(0);
  let sourceMeshesInRadius = $state(0);
  let loadProgress = $state(0);
  let activeTiles = $state(0);
  let visibleTiles = $state(0);
  let saveMessage = $state("");
  let lastTrackedMeshChangeAt = 0;
  let isStable = $state(false);
  let isSaving = $state(false);

  onMount(() => {
    void setup();
  });

  onDestroy(() => {
    renderer?.setAnimationLoop(null);
    tilesRuntime?.dispose();
    renderer?.dispose();
  });

  async function setup(): Promise<void> {
    try {
      scene = new THREE.Scene();
      tilesGroup = new THREE.Group();
      scene.add(tilesGroup);

      camera = new THREE.PerspectiveCamera(
        85,
        window.innerWidth / window.innerHeight,
        1,
        20000,
      );
      camera.position.set(0, 2200, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      renderer.setSize(window.innerWidth, window.innerHeight);

      const source = await resolveBerlinTilesSource();
      tilesRuntime = await TilesRuntimeAdapter.create(tilesGroup, source);
      status = "Streaming tiles around Berlin center...";
      lastTrackedMeshChangeAt = performance.now();
      renderer.setAnimationLoop(tick);
    } catch (error) {
      status =
        error instanceof Error
          ? error.message
          : "Failed to initialize Berlin cone source capture.";
    }
  }

  function tick(): void {
    if (!tilesRuntime || !renderer || !scene || !camera) {
      return;
    }

    tilesRuntime.update([camera], renderer);
    renderer.render(scene, camera);

    const stats = tilesRuntime.getDebugStats();
    loadProgress = stats.loadProgress;
    activeTiles = stats.activeTiles;
    visibleTiles = stats.visibleTiles;

    const nextTrackedMeshes = tilesRuntime.getTrackedTileMeshes();
    if (nextTrackedMeshes.length !== trackedMeshes) {
      trackedMeshes = nextTrackedMeshes.length;
      lastTrackedMeshChangeAt = performance.now();
    }

    const exportPreview = buildBerlinConeSourceMeshFile(nextTrackedMeshes, {
      center: CAPTURE_CENTER,
      radiusMeters: CAPTURE_RADIUS_METERS,
    });
    sourceMeshesInRadius = exportPreview.sourceMeshesInRadius;
    isStable =
      loadProgress >= 1 &&
      performance.now() - lastTrackedMeshChangeAt >= 1500;
    status = isStable
      ? "Ready to save 1km source mesh capture."
      : "Waiting for tile streaming to stabilize...";
  }

  async function saveCapture(): Promise<void> {
    if (!tilesRuntime || isSaving) {
      return;
    }

    isSaving = true;
    saveMessage = "";

    try {
      const exportResult = buildBerlinConeSourceMeshFile(
        tilesRuntime.getTrackedTileMeshes(),
        {
          center: CAPTURE_CENTER,
          radiusMeters: CAPTURE_RADIUS_METERS,
        },
      );
      const response = await fetch("/api/berlin-cone-source", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          center: CAPTURE_CENTER,
          radiusMeters: CAPTURE_RADIUS_METERS,
          sourceFile: exportResult.file,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      saveMessage = `Saved ${result.savedMeshes} meshes to center-1km.json and updated source-manifest.json`;
    } catch (error) {
      saveMessage =
        error instanceof Error ? error.message : "Failed to save cone source capture.";
    } finally {
      isSaving = false;
    }
  }
</script>

<main>
  <section class="panel">
    <div class="meta">
      <h1>Berlin Cone Source Capture</h1>
      <div class="stats">
        <span>center {CAPTURE_CENTER.x}, {CAPTURE_CENTER.z}</span>
        <span>radius {CAPTURE_RADIUS_METERS}m</span>
        <span>progress {loadProgress.toFixed(2)}</span>
        <span>visible tiles {visibleTiles}</span>
        <span>active tiles {activeTiles}</span>
        <span>tracked meshes {trackedMeshes}</span>
        <span>meshes in radius {sourceMeshesInRadius}</span>
        <span>chunk budget {BERLIN_CONE_GRID.MAX_CHUNK_LOADS_PER_TICK}</span>
      </div>
      <p>{status}</p>
      <button onclick={saveCapture} disabled={!isStable || isSaving}>
        {isSaving ? "Saving..." : "Save 1km Cesium Building Capture"}
      </button>
      {#if saveMessage}
        <p class="message">{saveMessage}</p>
      {/if}
    </div>
    <canvas bind:this={canvas}></canvas>
  </section>
</main>

<style>
  main {
    height: 100vh;
    margin: 0;
    background: #0c1016;
    color: #e5edf5;
    font-family: system-ui, sans-serif;
  }

  .panel {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    height: 100%;
  }

  .meta {
    padding: 20px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
  }

  .stats {
    display: grid;
    gap: 6px;
    font-size: 0.9rem;
    color: #b7c4d1;
  }

  p {
    margin: 0;
    color: #cdd7e1;
  }

  .message {
    color: #9fe3b4;
  }

  button {
    appearance: none;
    border: 0;
    background: #4c8dff;
    color: white;
    padding: 10px 14px;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
