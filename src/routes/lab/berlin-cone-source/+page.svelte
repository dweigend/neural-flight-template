<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import {
    BERLIN_PLAYER_SPAWN_POSITION,
    BERLIN_TILE_SELECTION_FOV,
  } from "$lib/experiences/berlin-flight/constants";
  import {
    buildBerlinSourceFilesBySourceUrl,
    createBerlinFullCitySweepPlan,
  } from "$lib/experiences/berlin-flight/cone-data/full-city-export";
  import type { BerlinConeSourceMeshFile } from "$lib/experiences/berlin-flight/cone-data/source-contracts";
  import {
    isBerlinTilesSourceConfigured,
    resolveBerlinTilesSource,
  } from "$lib/experiences/berlin-flight/runtime/tiles-source";
  import { TilesRuntimeAdapter } from "$lib/experiences/berlin-flight/runtime/tiles-runtime";

  const FALLBACK_CAMERA_HEIGHT = 2600;
  const CAMERA_HEIGHT = Number.isFinite(BERLIN_PLAYER_SPAWN_POSITION.y)
    ? BERLIN_PLAYER_SPAWN_POSITION.y
    : FALLBACK_CAMERA_HEIGHT;
  const CAMERA_FAR = 10000;
  const SWEEP_STEP_METERS = 2500;
  const STABLE_SETTLE_MS = 1500;

  const sweepPlan = createBerlinFullCitySweepPlan(SWEEP_STEP_METERS);

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let tilesGroup: THREE.Group | null = null;
  let tilesRuntime = $state<TilesRuntimeAdapter | null>(null);
  let sourceLabel = $state("Cesium source not resolved");

  let status = $state("Waiting for Berlin Cesium source...");
  let trackedMeshes = $state(0);
  let activeTiles = $state(0);
  let visibleTiles = $state(0);
  let loadProgress = $state(0);
  let capturedSourceTiles = $state(0);
  let capturedMeshes = $state(0);
  let currentSweepIndex = $state(0);
  let isSweeping = $state(false);
  let isSaving = $state(false);
  let saveMessage = $state("");

  const exportedFilesBySourceUrl = new Map<string, BerlinConeSourceMeshFile>();
  const seenSourceUrls = new Set<string>();
  let lastTrackedMeshVersion = -1;
  let lastTrackedMeshChangeAt = 0;
  let sweepAdvancePending = false;

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
      if (!isBerlinTilesSourceConfigured()) {
        throw new Error(
          "[BerlinFlight] Cesium source is not configured. Set PUBLIC_BERLIN_TILES_URL or PUBLIC_CESIUM_ION_TOKEN with PUBLIC_BERLIN_ION_ASSET_ID before running the full-Berlin exporter.",
        );
      }

      scene = new THREE.Scene();
      tilesGroup = new THREE.Group();
      scene.add(tilesGroup);

      camera = new THREE.PerspectiveCamera(
        BERLIN_TILE_SELECTION_FOV,
        window.innerWidth / window.innerHeight,
        1,
        CAMERA_FAR,
      );
      moveCameraToSweepCell(0);

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      renderer.setSize(window.innerWidth, window.innerHeight);

      const source = await resolveBerlinTilesSource();
      sourceLabel = source.url;
      tilesRuntime = await TilesRuntimeAdapter.create(tilesGroup, source);
      lastTrackedMeshChangeAt = performance.now();
      status = "Ready to sweep Berlin via the configured Cesium source.";
      renderer.setAnimationLoop(tick);
    } catch (error) {
      status =
        error instanceof Error
          ? error.message
          : "Failed to initialize the full-Berlin cone source exporter.";
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
    trackedMeshes = stats.trackedMeshes;

    const trackedMeshVersion = tilesRuntime.getTrackedTileMeshVersion();
    if (trackedMeshVersion !== lastTrackedMeshVersion) {
      lastTrackedMeshVersion = trackedMeshVersion;
      lastTrackedMeshChangeAt = performance.now();
    }

    if (!isSweeping || sweepAdvancePending) {
      return;
    }

    const isStable =
      loadProgress >= 1 &&
      performance.now() - lastTrackedMeshChangeAt >= STABLE_SETTLE_MS;
    status = isStable
      ? `Capturing sweep cell ${currentSweepIndex + 1} of ${sweepPlan.cells.length}...`
      : `Waiting for sweep cell ${currentSweepIndex + 1} of ${sweepPlan.cells.length} to settle...`;

    if (!isStable) {
      return;
    }

    sweepAdvancePending = true;
    void captureCurrentSweepCell().finally(() => {
      sweepAdvancePending = false;
    });
  }

  async function startSweep(): Promise<void> {
    if (!tilesRuntime || !camera || isSweeping || isSaving) {
      return;
    }

    exportedFilesBySourceUrl.clear();
    seenSourceUrls.clear();
    capturedSourceTiles = 0;
    capturedMeshes = 0;
    currentSweepIndex = 0;
    saveMessage = "";
    isSweeping = true;
    moveCameraToSweepCell(0);
    lastTrackedMeshChangeAt = performance.now();
    status = `Sweeping 1 of ${sweepPlan.cells.length} cells...`;
  }

  async function captureCurrentSweepCell(): Promise<void> {
    if (!tilesRuntime) {
      return;
    }

    const exportResult = buildBerlinSourceFilesBySourceUrl(
      tilesRuntime.getTrackedTileMeshes(),
      seenSourceUrls,
    );

    for (const [sourceUrl, file] of exportResult.filesBySourceUrl) {
      seenSourceUrls.add(sourceUrl);
      exportedFilesBySourceUrl.set(sourceUrl, file);
    }

    capturedSourceTiles = exportedFilesBySourceUrl.size;
    capturedMeshes += exportResult.meshesAdded;

    if (currentSweepIndex + 1 >= sweepPlan.cells.length) {
      isSweeping = false;
      await saveExport();
      return;
    }

    currentSweepIndex += 1;
    moveCameraToSweepCell(currentSweepIndex);
    lastTrackedMeshChangeAt = performance.now();
    status = `Sweeping ${currentSweepIndex + 1} of ${sweepPlan.cells.length} cells...`;
  }

  async function saveExport(): Promise<void> {
    if (isSaving) {
      return;
    }

    if (exportedFilesBySourceUrl.size === 0) {
      status = "[BerlinFlight] Sweep finished without collecting any tracked tile meshes.";
      return;
    }

    isSaving = true;
    status = "Saving full-Berlin cone source export...";
    saveMessage = "";

    try {
      const response = await fetch("/api/berlin-cone-source/full-city", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceTiles: Array.from(exportedFilesBySourceUrl.entries()).map(
            ([sourceUrl, file]) => ({
              sourceUrl,
              file,
            }),
          ),
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      saveMessage = `Saved ${result.savedSourceFiles} source files and ${result.savedMeshes} meshes to full-berlin export.`;
      status = "Full-Berlin cone source export complete.";
    } catch (error) {
      status =
        error instanceof Error
          ? error.message
          : "Failed to save the full-Berlin cone source export.";
    } finally {
      isSaving = false;
    }
  }

  function moveCameraToSweepCell(index: number): void {
    if (!camera) {
      return;
    }

    const cell = sweepPlan.cells[index];
    camera.position.set(cell.x, CAMERA_HEIGHT, cell.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(getSweepLookAtTarget(index));
    camera.updateMatrixWorld(true);
  }

  function getSweepLookAtTarget(index: number): THREE.Vector3 {
    const targetCell =
      sweepPlan.cells[index + 1] ??
      sweepPlan.cells[index - 1] ?? {
        x: sweepPlan.cells[index].x,
        z: sweepPlan.cells[index].z - 1,
      };

    return new THREE.Vector3(targetCell.x, CAMERA_HEIGHT, targetCell.z);
  }
</script>

<main>
  <section class="panel">
    <div class="meta">
      <h1>Berlin Cone Source Export</h1>
      <div class="stats">
        <span>source {sourceLabel}</span>
        <span>camera height {CAMERA_HEIGHT}m</span>
        <span>camera fov {BERLIN_TILE_SELECTION_FOV}deg</span>
        <span>sweep step {SWEEP_STEP_METERS}m</span>
        <span>sweep cells {sweepPlan.cells.length}</span>
        <span>progress {loadProgress.toFixed(2)}</span>
        <span>visible tiles {visibleTiles}</span>
        <span>active tiles {activeTiles}</span>
        <span>tracked meshes {trackedMeshes}</span>
        <span>captured source tiles {capturedSourceTiles}</span>
        <span>captured meshes {capturedMeshes}</span>
        <span>current cell {Math.min(currentSweepIndex + 1, sweepPlan.cells.length)} / {sweepPlan.cells.length}</span>
      </div>
      <p>{status}</p>
      <button onclick={startSweep} disabled={isSweeping || isSaving || !tilesRuntime}>
        {isSweeping ? "Sweeping..." : isSaving ? "Saving..." : "Start Full-Berlin Sweep"}
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
