import * as THREE from "three";

// ══════════════════════════════════════════════════════════════════
// SETTINGS — edit to control battery appearance & timing
// ══════════════════════════════════════════════════════════════════

export const BATTERY = {
  // ── Timing ──────────────────────────────────────────────────────
  totalTimeMs: 50000, // Total experience time in ms (default 5 min=300000)

  // ── Colors ──────────────────────────────────────────────────────
  outlineColor: "#ff44aa", // Battery outline stroke color
  barColor: "#00ffcc", // Fill color of each battery segment
  flickerColor: "#ff44aa", // Last-bar flicker color at 95%+

  // ── Flicker ─────────────────────────────────────────────────────
  flickerSpeedMs: 700, // Full on/off cycle duration in ms

  // ── Texture ─────────────────────────────────────────────────────
  textureWidth: 120, // Canvas width in pixels
  textureHeight: 220, // Canvas height in pixels

  // ── Sprite (world-space) ────────────────────────────────────────
  spriteScaleX: 0.3, // Sprite width in world units
  spriteScaleY: 0.15, // Sprite height in world units
  distance: 1.8, // Distance from camera in world units
  posX: 1.3, // Horizontal offset from camera center (right = +)
  posY: 0.85, // Vertical offset from camera center (up = +)

  // ── Visual ──────────────────────────────────────────────────────
  outlineWidth: 3, // Stroke width of outline (canvas px)
  glowPercent: 50, // Glow intensity 0–100
  padding: 8, // Padding between outline & bars (canvas px)
  barGap: 5, // Gap between bars (canvas px)
  barCount: 4, // Number of battery segments
  tabW: 35, // Terminal tab width (canvas px)
  tabH: 15, // Terminal tab height (canvas px)
  tabMargin: 4, // Margin below tab (canvas px)
};

// ══════════════════════════════════════════════════════════════════
// BatteryOverlay — canvas-drawn battery icon as a camera-aligned sprite
// ══════════════════════════════════════════════════════════════════

export class BatteryOverlay {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _startTime: number | null = null;
  private _elapsed: number = 0;
  private _paused: boolean = false;
  private _flickerOn: boolean = false;
  private _isFlickering: boolean = false;
  private _lastFlickerTime: number = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = BATTERY.textureWidth;
    this.canvas.height = BATTERY.textureHeight;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.renderOrder = 1000;
    this.sprite.frustumCulled = false;

    this._draw(4, false, false);
  }

  /** Add sprite as a child of the camera (screen-fixed HUD) */
  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.sprite);
    this.sprite.position.set(BATTERY.posX, BATTERY.posY, -BATTERY.distance);
    this.sprite.scale.set(BATTERY.spriteScaleY, BATTERY.spriteScaleX, 1);
    (this.sprite.material as THREE.SpriteMaterial).rotation = -Math.PI / 2;
  }

  /** Begin the countdown from now */
  start(): void {
    this._startTime = performance.now();
    this._elapsed = 0;
    this._flickerOn = false;
  }

  /** Call every frame — drives bar state and flicker animation */
  update(now: number): void {
    if (this._startTime === null || this._paused) return;

    this._elapsed = now - this._startTime;
    const fraction = Math.min(this._elapsed / BATTERY.totalTimeMs, 1);
    const bars = this._computeBars(fraction);

    const flickering = fraction >= 0.95 && bars === 1 && fraction < 1;
    this._isFlickering = flickering;
    if (flickering) {
      if (now - this._lastFlickerTime > BATTERY.flickerSpeedMs / 2) {
        this._flickerOn = !this._flickerOn;
        this._lastFlickerTime = now;
      }
    } else {
      this._flickerOn = false;
    }

    this._draw(bars, this._flickerOn, this._isFlickering);
  }

  /** Reset to full battery (bars = 4) and clear start time */
  reset(): void {
    this._startTime = null;
    this._elapsed = 0;
    this._flickerOn = false;
    this._isFlickering = false;
    this._draw(4, false, false);
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }

  /** Re-draw from current config (call after settings change) */
  redraw(): void {
    const fraction =
      this._startTime !== null
        ? Math.min(this._elapsed / BATTERY.totalTimeMs, 1)
        : 0;
    const bars = this._computeBars(fraction);
    this._draw(bars, this._flickerOn, this._isFlickering);
  }

  // ── Private ─────────────────────────────────────────────────────

  private _computeBars(fraction: number): number {
    if (fraction >= 1) return 0;
    if (fraction >= 0.75) return 1;
    if (fraction >= 0.5) return 2;
    if (fraction >= 0.25) return 3;
    return 4;
  }

  private _draw(bars: number, flickerOn: boolean, isFlickering: boolean): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    this._drawOutline(ctx, w, h, bars);
    this._drawBars(ctx, w, h, bars, flickerOn, isFlickering);

    this.texture.needsUpdate = true;
  }

  private _drawOutline(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bars: number,
  ): void {
    const color = bars <= 1 ? BATTERY.flickerColor : BATTERY.outlineColor;
    const lw = BATTERY.outlineWidth;
    const glow = (BATTERY.glowPercent / 100) * 24;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;

    // Main body — height adapts so the tab always fits
    const bX = lw + 2;
    const bY = 4;
    const bW = w - (lw + 2) * 2;
    const bBottom = h - BATTERY.tabH - BATTERY.tabMargin;
    const bH = bBottom - bY;
    ctx.strokeRect(bX, bY, bW, bH);

    // Terminal tab (connects to body bottom edge, centered)
    const tabX = (w - BATTERY.tabW) / 2;
    ctx.strokeRect(tabX, bBottom, BATTERY.tabW, BATTERY.tabH);

    ctx.restore();
  }

  private _drawBars(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bars: number,
    flickerOn: boolean,
    isFlickering: boolean,
  ): void {
    const lw = BATTERY.outlineWidth;
    const pad = BATTERY.padding + lw;
    const innerW = w - pad * 2;
    const barCount = BATTERY.barCount;
    const gap = BATTERY.barGap;

    // Inner area: inside the body outline, above tab
    const bodyTop = 4;
    const bodyBottom = h - BATTERY.tabH - BATTERY.tabMargin;
    const barTop = bodyTop + pad;
    const barBottom = bodyBottom - pad;
    const innerH = barBottom - barTop;

    const barH = (innerH - (barCount - 1) * gap) / barCount;
    const barW = innerW * 0.75;
    const barX = (w - barW) / 2;

    // With -PI/2 rotation: canvas bottom→screen left, canvas top→screen right.
    // Index 0 (canvas top, screen right) is last; index barCount-1 (bottom) goes first.
    for (let i = 0; i < barCount; i++) {
      const visible = i < bars;
      if (!visible) continue;

      const y = barTop + i * (barH + gap);
      const isLast = i === 0;
      if (isLast && isFlickering && !flickerOn) continue;
      const color =
        isLast && bars <= 1 ? BATTERY.flickerColor : BATTERY.barColor;

      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = (BATTERY.glowPercent / 100) * 24;
      ctx.fillRect(barX, y, barW, barH);
      ctx.restore();
    }
  }
}
