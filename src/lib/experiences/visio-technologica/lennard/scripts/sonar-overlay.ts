import * as THREE from "three";

export const SONAR = {
  // ── Canvas (pixel dimensions of the offscreen canvas) ───────────
  textureWidth: 800, // Canvas width in pixels
  textureHeight: 800, // Canvas height in pixels

  // ── Sprite (world-space size and distance from camera) ──────────
  spriteScale: 1.5, // Uniform sprite scale in world units
  distance: 1.8, // Z-offset from camera (world units)

  // ── Outer Circle ────────────────────────────────────────────────
  circleRadiusFraction: 0.95, // 0–1 (fraction of half-canvas). 1.0 = touches canvas edge, >1 clips.
  circleLineWidth: 5.5, // Stroke width of the outer ring (canvas px)
  // 💡 To make the circle bigger in the scene without clipping: increase spriteScale.
  //    circleRadiusFraction controls circle-vs-canvas ratio; spriteScale controls world size.

  // ── Sweep Beam (glow trailing behind the scan line) ────────────
  rotationSpeed: 20, // Scan line rotation speed (degrees / sec)
  glowAngleDeg: 80, // Angular width of the trailing glow wedge (degrees)
  glowMaxAlpha: 0.3, // Peak opacity of the glow wedge (0–1)
  glowSegments: 50, // Radial segments for the glow wedge gradient

  // ── Ambient Dots (activate when the scan line passes over them) ─
  dotCount: 15, // Number of randomly placed dots
  dotRadius: 11, // Base dot radius (canvas px)
  dotActiveGlowRadius: 30, // Outer glow radius when a dot is hit (canvas px)
  dotFadeDuration: 2.8, // Seconds for a hit dot to fade out completely
  dotActivationThresholdDeg: 4, // Angular proximity (degrees) that triggers a dot

  // ── Center Crosshair ────────────────────────────────────────────
  crossArmLength: 320, // Length of each crosshair arm from center (canvas px)
  crossGap: 30, // Empty gap around the center (canvas px)
  crossLineWidth: 1.5, // Stroke width of crosshair lines (canvas px)

  // ── Inner Concentric Circles ────────────────────────────────────
  innerCircles: [
    { radiusFraction: 0.1, lineWidth: 1, color: "#ff44aa" },
    { radiusFraction: 0.2, lineWidth: 1, color: "#008866" },
    { radiusFraction: 0.3, lineWidth: 1, color: "#008866" },
    { radiusFraction: 0.4, lineWidth: 1, color: "#008866" },
    { radiusFraction: 0.6, lineWidth: 2.0, color: "#00ffcc" },
  ] as InnerCircleDef[],
  // Each entry: radiusFraction (0–1 as % of outer circle), lineWidth (canvas px), color.

  // ── Radial Tick Marks (unified ring, inside the circle) ────────
  tickCount: 360, // Total ticks around the full circle (36 = every 10°)
  tickInnerRadiusFrac: 0.9, // Inner (center-ward) radius of ticks as fraction of outer circle radius
  tickMajorInterval: 10, // Every Nth tick is a major tick (3 = every 30°)
  tickMajor2Interval: 90, // Every Nth tick is the largest major tick (9 = every 90°)
  tickMinorLength: 12, // Length of minor ticks inward from tickInnerRadius (canvas px)
  tickMajorLength: 20, // Length of medium ticks (30° marks)
  tickMajor2Length: 32, // Length of largest ticks (90° marks)
  tickWidth: 2, // Stroke width of tick marks (canvas px)
  tickMinorColor: "#008866", // Color of minor tick marks
  tickMajorColor: "#ff44aa", // Color of medium tick marks
  tickMajor2Color: "#ff44aa", // Color of largest tick marks
  tickGlowBlur: 6, // Shadow blur for tick glow (canvas px)

  // ── Colors ─────────────────────────────────────────────────────
  circleColor: "#ff44aa", // Outer ring stroke color
  lineColor: "#ff44aa", // Scan line stroke color
  glowColor: "#ff44aa", // Sweep beam glow color
  dotColor: "#ff44aa", // Dot fill color (base + glow)
  crossColor: "#00ffcc", // Crosshair and tick mark stroke color

  // ── Fade-Out Animation ──────────────────────────────────────────
  fadeOutDuration: 1.3, // Total fade-out duration in seconds
  fadeOutPeakScale: 1.2, // Scale multiplier at the peak (sonar grows then shrinks)
  fadeOutPeakTimeFrac: 0.45, // Fraction of duration at which peak is reached (0-1)
};

export interface InnerCircleDef {
  radiusFraction: number;
  lineWidth: number;
  color: string;
}

interface DotState {
  angle: number;
  radiusFrac: number;
  lastActivation: number;
}

export class SonarOverlay {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dots: DotState[] = [];
  private scanAngle = -Math.PI / 2;
  private lastTime = 0;
  private fadeOutStart = -1;
  private baseScale = SONAR.spriteScale;
  private fadeOutComplete = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SONAR.textureWidth;
    this.canvas.height = SONAR.textureHeight;
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
    this.sprite.renderOrder = 999;
    this.sprite.frustumCulled = false;

    this._initDots();
    this.lastTime = performance.now();
    this._draw();
  }

  /** Start the fade-out animation: grows slightly then shrinks to zero. */
  startFadeOut(): void {
    this.fadeOutStart = performance.now();
    this.baseScale = this.sprite.scale.x;
    this.fadeOutComplete = false;
  }

  /** Returns true once the fade-out animation has fully finished. */
  get isFadedOut(): boolean {
    return this.fadeOutComplete;
  }

  /** Instantly hide/show the sonar (useful for reset). */
  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
  }

  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.sprite);
    this.sprite.position.set(0, 0, -SONAR.distance);
    this.sprite.scale.set(SONAR.spriteScale, SONAR.spriteScale, 1);
    this.baseScale = SONAR.spriteScale;
  }

  update(): void {
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // ── Fade-out animation ──
    if (this.fadeOutStart >= 0 && !this.fadeOutComplete) {
      const elapsed = (now - this.fadeOutStart) / 1000;
      const dur = SONAR.fadeOutDuration;
      if (elapsed >= dur) {
        this.sprite.scale.set(0, 0, 1);
        this.sprite.visible = false;
        this.fadeOutComplete = true;
      } else {
        const t = elapsed / dur;
        // Scale curve: rise to peakScale at t=peakTimeFrac, then ease to 0
        const peakT = SONAR.fadeOutPeakTimeFrac;
        let multiplier: number;
        if (t <= peakT) {
          // Linear rise to peak
          multiplier = 1 + (SONAR.fadeOutPeakScale - 1) * (t / peakT);
        } else {
          // Quadratic ease-out from peak down to 0
          const fallFrac = (t - peakT) / (1 - peakT);
          multiplier = SONAR.fadeOutPeakScale * (1 - fallFrac * fallFrac);
        }
        const s = this.baseScale * multiplier;
        this.sprite.scale.set(s, s, 1);
      }
    }

    this.scanAngle += (SONAR.rotationSpeed * delta * Math.PI) / 180;
    if (this.scanAngle > Math.PI * 2) {
      this.scanAngle -= Math.PI * 2;
    }

    const thresholdRad = SONAR.dotActivationThresholdDeg * (Math.PI / 180);
    for (const dot of this.dots) {
      if (this._angleDiff(this.scanAngle, dot.angle) < thresholdRad) {
        dot.lastActivation = now;
      }
    }

    this._draw();
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }

  private _initDots(): void {
    const rMin = 0.1;
    const rMax = 0.9;
    this.dots = [];
    for (let i = 0; i < SONAR.dotCount; i++) {
      this.dots.push({
        angle: Math.random() * Math.PI * 2,
        radiusFrac: rMin + Math.random() * (rMax - rMin),
        lastActivation: 0,
      });
    }
  }

  private _angleDiff(a: number, b: number): number {
    let d = a - b;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  private _draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) * SONAR.circleRadiusFraction;

    ctx.clearRect(0, 0, w, h);
    this._drawGlow(ctx, cx, cy, radius);
    this._drawDots(ctx, cx, cy, radius);
    this._drawInnerCircles(ctx, cx, cy, radius);
    this._drawCircle(ctx, cx, cy, radius);
    this._drawTickMarks(ctx, cx, cy, radius);
    this._drawCrosshair(ctx, cx, cy);
    this._drawScanLine(ctx, cx, cy, radius);
    this.texture.needsUpdate = true;
  }

  private _drawGlow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const glowRad = SONAR.glowAngleDeg * (Math.PI / 180);
    const seg = SONAR.glowSegments;

    for (let i = 0; i < seg; i++) {
      const t0 = i / seg;
      const t1 = (i + 1) / seg;
      const alpha = SONAR.glowMaxAlpha * (1 - (t0 + t1) / 2);

      const a1 = this.scanAngle - glowRad * t1;
      const a2 = this.scanAngle - glowRad * t0;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a1, a2);
      ctx.closePath();
      ctx.fillStyle = SONAR.glowColor;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private _drawDots(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const now = performance.now();
    const fadeMs = SONAR.dotFadeDuration * 1000;

    for (const dot of this.dots) {
      const elapsed = now - dot.lastActivation;
      if (elapsed > fadeMs) continue;
      const brightness = 1 - elapsed / fadeMs;

      const x = cx + Math.cos(dot.angle) * radius * dot.radiusFrac;
      const y = cy + Math.sin(dot.angle) * radius * dot.radiusFrac;

      ctx.save();
      ctx.globalAlpha = brightness * 0.3;
      ctx.fillStyle = SONAR.dotColor;
      ctx.shadowColor = SONAR.dotColor;
      ctx.shadowBlur = SONAR.dotActiveGlowRadius * 2;
      ctx.beginPath();
      ctx.arc(x, y, SONAR.dotActiveGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = brightness;
      ctx.fillStyle = SONAR.dotColor;
      ctx.beginPath();
      ctx.arc(x, y, SONAR.dotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private _drawInnerCircles(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerRadius: number,
  ): void {
    for (const c of SONAR.innerCircles) {
      const r = outerRadius * c.radiusFraction;
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.lineWidth;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private _drawCircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = SONAR.circleColor;
    ctx.lineWidth = SONAR.circleLineWidth;
    ctx.shadowColor = SONAR.circleColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private _drawTickMarks(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    ctx.save();
    ctx.lineWidth = SONAR.tickWidth;
    ctx.shadowBlur = SONAR.tickGlowBlur;

    const count = SONAR.tickCount;
    const innerRadius = radius * SONAR.tickInnerRadiusFrac;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      const isMajor = i % SONAR.tickMajorInterval === 0;
      const isMajor2 = i % SONAR.tickMajor2Interval === 0;
      const len = isMajor2
        ? SONAR.tickMajor2Length
        : isMajor
          ? SONAR.tickMajorLength
          : SONAR.tickMinorLength;
      const color = isMajor2
        ? SONAR.tickMajor2Color
        : isMajor
          ? SONAR.tickMajorColor
          : SONAR.tickMinorColor;

      ctx.strokeStyle = color;
      ctx.shadowColor = color;

      const x1 = cx + Math.cos(a) * innerRadius;
      const y1 = cy + Math.sin(a) * innerRadius;
      const x2 = cx + Math.cos(a) * (innerRadius + len);
      const y2 = cy + Math.sin(a) * (innerRadius + len);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawCrosshair(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
  ): void {
    const arm = SONAR.crossArmLength;
    const gap = SONAR.crossGap;
    const lw = SONAR.crossLineWidth;

    ctx.save();
    ctx.strokeStyle = SONAR.crossColor;
    ctx.lineWidth = lw;
    ctx.shadowColor = SONAR.crossColor;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + arm);
    ctx.stroke();

    ctx.restore();
  }

  private _drawScanLine(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const x = cx + Math.cos(this.scanAngle) * radius;
    const y = cy + Math.sin(this.scanAngle) * radius;

    ctx.save();
    ctx.strokeStyle = SONAR.lineColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = SONAR.lineColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }
}
