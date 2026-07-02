import * as THREE from "three";
import {
  BERLIN_DEBUG_OVERLAY_HEIGHT,
  BERLIN_DEBUG_OVERLAY_UPDATE_SECONDS,
  BERLIN_DEBUG_OVERLAY_WIDTH,
} from "./config";
import type { BerlinCollisionDebugStats } from "../collision/controller";
import type { BerlinConePlacementDebugSnapshot } from "../cone-placement/types";
import { BERLIN_MITTE_ORIGIN } from "../geo/berlin-mitte-origin";
import { localToGeo } from "../geo/coordinates";
import { getBerlinCameraDensitySampler } from "../heatmaps/camera-density-loader";
import type { BerlinPlacementDebugSnapshot } from "../placement/types";
import type { TilesRuntimeDebugStats } from "../runtime/tiles-runtime";
import type { BerlinState } from "../types";

export interface BerlinDebugOverlay {
  update(state: BerlinState, elapsed: number): void;
  dispose(): void;
}

const SPRITE_SCALE = {
  x: 1.25,
  y: 0.55,
  z: 1,
} as const;

const SPRITE_POSITION = {
  x: -0.9,
  y: 0.52,
  z: -1.8,
} as const;

export function createBerlinDebugOverlay(
  camera: THREE.PerspectiveCamera,
): BerlinDebugOverlay {
  return new CanvasDebugOverlay(camera);
}

class CanvasDebugOverlay implements BerlinDebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly sprite: THREE.Sprite;
  private tilesStats: TilesRuntimeDebugStats = createEmptyTilesStats();
  private readonly collisionStats: BerlinCollisionDebugStats = {
    activeCones: 0,
    trackedMeshes: 0,
    dirtyMeshes: 0,
    processedMeshesLastTick: 0,
    verticesTestedLastTick: 0,
  };
  private placementSnapshot: BerlinPlacementDebugSnapshot = {
    counters: {
      scannedBuildings: 0,
      scannedCandidates: 0,
      acceptedPoints: 0,
      rejectedBySpacing: 0,
      stalePointsRemoved: 0,
      activeDebugMarkerCount: 0,
    },
    lastUpdateDurationMs: 0,
    acceptedPoints: [],
  };
  private conePlacementSnapshot: BerlinConePlacementDebugSnapshot = {
    counters: {
      acceptedPoints: 0,
      activeCones: 0,
      pendingPoints: 0,
      processedPoints: 0,
      skippedMissingNeighborhood: 0,
      skippedAmbiguousDirection: 0,
      activeDebugMarkerCount: 0,
    },
    lastUpdateDurationMs: 0,
    activeCones: [],
  };

  private disposed = false;
  private nextUpdate = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = BERLIN_DEBUG_OVERLAY_WIDTH;
    this.canvas.height = BERLIN_DEBUG_OVERLAY_HEIGHT;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[BerlinFlight] Could not create debug overlay canvas.");
    }

    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.name = "BerlinDebugOverlay";
    this.sprite.renderOrder = 1000;
    this.sprite.position.set(
      SPRITE_POSITION.x,
      SPRITE_POSITION.y,
      SPRITE_POSITION.z,
    );
    this.sprite.scale.set(SPRITE_SCALE.x, SPRITE_SCALE.y, SPRITE_SCALE.z);
    camera.add(this.sprite);
  }

  public update(state: BerlinState, elapsed: number): void {
    if (this.disposed) return;
    if (elapsed < this.nextUpdate) return;

    this.nextUpdate = elapsed + BERLIN_DEBUG_OVERLAY_UPDATE_SECONDS;
    this.tilesStats = state.tilesRuntime?.getDebugStats() ?? createEmptyTilesStats();
    state.collisionController.writeDebugStats(this.collisionStats);
    this.placementSnapshot = state.placementController.getSnapshot();
    this.conePlacementSnapshot = state.conePlacementController.getSnapshot();

    this.draw(state);
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }

  private draw(state: BerlinState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "rgba(8, 12, 18, 0.72)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.font = "20px monospace";
    ctx.fillStyle = "#f6f8fb";
    ctx.fillText("Berlin Flight Debug", 18, 30);

    ctx.font = "16px monospace";
    ctx.fillStyle = "#b9fbc0";
    const heatmapLines = getHeatmapDebugLines(state);
    const lines = [
      `loading: ${state.isLoading}`,
      `disposed: ${state.isDisposed}`,
      `speed: ${state.player.velocity.toFixed(1)} m/s`,
      `tiles renderer: ${this.tilesStats.hasRenderer}`,
      `tiles visible: ${this.tilesStats.isVisible}`,
      `load progress: ${this.tilesStats.loadProgress.toFixed(2)}`,
      `visible tiles: ${this.tilesStats.visibleTiles}`,
      `active tiles: ${this.tilesStats.activeTiles}`,
      `tracked meshes: ${this.tilesStats.trackedMeshes}`,
      `active cones: ${this.collisionStats.activeCones}`,
      `dirty meshes: ${this.collisionStats.dirtyMeshes}`,
      `meshes/tick: ${this.collisionStats.processedMeshesLastTick}`,
      `vertices/tick: ${this.collisionStats.verticesTestedLastTick}`,
      `placement buildings: ${this.placementSnapshot.counters.scannedBuildings}`,
      `placement candidates: ${this.placementSnapshot.counters.scannedCandidates}`,
      `placement accepted: ${this.placementSnapshot.counters.acceptedPoints}`,
      `spacing rejects: ${this.placementSnapshot.counters.rejectedBySpacing}`,
      `placement stale: ${this.placementSnapshot.counters.stalePointsRemoved}`,
      `placement ms: ${this.placementSnapshot.lastUpdateDurationMs.toFixed(2)}`,
      `placement markers: ${this.placementSnapshot.counters.activeDebugMarkerCount}`,
      ...heatmapLines,
      `cone points: ${this.conePlacementSnapshot.counters.acceptedPoints}`,
      `cone active: ${this.conePlacementSnapshot.counters.activeCones}`,
      `cone pending: ${this.conePlacementSnapshot.counters.pendingPoints}`,
      `cone processed: ${this.conePlacementSnapshot.counters.processedPoints}`,
      `cone skip none: ${this.conePlacementSnapshot.counters.skippedMissingNeighborhood}`,
      `cone skip ambig: ${this.conePlacementSnapshot.counters.skippedAmbiguousDirection}`,
      `cone ms: ${this.conePlacementSnapshot.lastUpdateDurationMs.toFixed(2)}`,
      `cone markers: ${this.conePlacementSnapshot.counters.activeDebugMarkerCount}`,
    ];

    for (let index = 0; index < lines.length; index += 1) {
      this.drawLine(index + 1, lines[index]);
    }
  }

  private drawLine(index: number, text: string): void {
    this.ctx.fillText(text, 18, 34 + index * 22);
  }
}

function createEmptyTilesStats(): TilesRuntimeDebugStats {
  return {
    hasRenderer: false,
    isDisposed: false,
    isVisible: false,
    loadProgress: 0,
    visibleTiles: 0,
    activeTiles: 0,
    trackedMeshes: 0,
  };
}

function getHeatmapDebugLines(state: BerlinState): readonly string[] {
  const sampler = getBerlinCameraDensitySampler();
  if (!sampler) {
    return ["heatmap: not loaded"];
  }

  const playerGeoPoint = localToGeo(BERLIN_MITTE_ORIGIN, {
    x: state.player.rig.position.x,
    y: state.player.rig.position.y,
    z: state.player.rig.position.z,
  });
  const originSample = sampler.sampleGeoPoint(
    BERLIN_MITTE_ORIGIN.lat,
    BERLIN_MITTE_ORIGIN.lon,
  );
  const playerSample = sampler.sampleGeoPoint(playerGeoPoint.lat, playerGeoPoint.lon);

  return [
    `heatmap: ${sampler.mode} ${sampler.imageWidth}x${sampler.imageHeight} ${sampler.imageOrientation}`,
    `heatmap bounds: N${sampler.bounds.north.toFixed(3)} S${sampler.bounds.south.toFixed(3)} W${sampler.bounds.west.toFixed(3)} E${sampler.bounds.east.toFixed(3)}`,
    "heatmap map: world -> localToGeo(origin) -> linear lat/lon UV",
    `heatmap origin uv: ${originSample.uv.u.toFixed(3)}, ${originSample.uv.v.toFixed(3)} density ${originSample.density.toFixed(2)}`,
    `heatmap player uv: ${playerSample.uv.u.toFixed(3)}, ${playerSample.uv.v.toFixed(3)} density ${playerSample.density.toFixed(2)}`,
  ];
}
