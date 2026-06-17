import * as THREE from "three";
import {
  BERLIN_DEBUG_OVERLAY_HEIGHT,
  BERLIN_DEBUG_OVERLAY_UPDATE_SECONDS,
  BERLIN_DEBUG_OVERLAY_WIDTH,
} from "./config";
import type { TilesRuntimeDebugStats } from "../runtime/tiles-runtime";
import type { BerlinState } from "../types";

export interface BerlinDebugOverlay {
  setEnabled(enabled: boolean): void;
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
  enabled: boolean,
): BerlinDebugOverlay {
  return new CanvasDebugOverlay(camera, enabled);
}

class CanvasDebugOverlay implements BerlinDebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly sprite: THREE.Sprite;
  private readonly tilesStats: TilesRuntimeDebugStats = {
    hasRenderer: false,
    isDisposed: false,
    isVisible: false,
    loadProgress: 0,
    visibleTiles: 0,
    activeTiles: 0,
  };

  private enabled = false;
  private disposed = false;
  private nextUpdate = 0;

  constructor(camera: THREE.PerspectiveCamera, enabled: boolean) {
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

    this.setEnabled(enabled);
  }

  public setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    if (this.enabled === enabled) return;

    this.enabled = enabled;
    this.sprite.visible = enabled;
    this.nextUpdate = 0;
  }

  public update(state: BerlinState, elapsed: number): void {
    if (this.disposed) return;
    if (!this.enabled) return;
    if (elapsed < this.nextUpdate) return;

    this.nextUpdate = elapsed + BERLIN_DEBUG_OVERLAY_UPDATE_SECONDS;
    state.tilesRuntime?.writeDebugStats(this.tilesStats);
    if (!state.tilesRuntime) {
      this.resetTilesStats();
    }

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

  private resetTilesStats(): void {
    this.tilesStats.hasRenderer = false;
    this.tilesStats.isDisposed = false;
    this.tilesStats.isVisible = false;
    this.tilesStats.loadProgress = 0;
    this.tilesStats.visibleTiles = 0;
    this.tilesStats.activeTiles = 0;
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
    this.drawLine(1, `loading: ${state.isLoading}`);
    this.drawLine(2, `disposed: ${state.isDisposed}`);
    this.drawLine(3, `speed: ${state.player.velocity.toFixed(1)} m/s`);
    this.drawLine(4, `tiles renderer: ${this.tilesStats.hasRenderer}`);
    this.drawLine(5, `tiles visible: ${this.tilesStats.isVisible}`);
    this.drawLine(
      6,
      `load progress: ${this.tilesStats.loadProgress.toFixed(2)}`,
    );
    this.drawLine(7, `visible tiles: ${this.tilesStats.visibleTiles}`);
    this.drawLine(8, `active tiles: ${this.tilesStats.activeTiles}`);
  }

  private drawLine(index: number, text: string): void {
    this.ctx.fillText(text, 18, 34 + index * 22);
  }
}
