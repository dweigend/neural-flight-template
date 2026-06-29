import * as THREE from "three";

export const SONAR = {
  rotationSpeed: 36,
  dotCount: 28,
  dotRadius: 3,
  dotActiveGlowRadius: 14,
  dotFadeDuration: 1.8,
  dotActivationThresholdDeg: 4,
  glowAngleDeg: 60,
  glowMaxAlpha: 0.3,
  glowSegments: 40,
  circleColor: "#00ffcc",
  lineColor: "#00ffcc",
  dotColor: "#00ffcc",
  glowColor: "#00ffcc",
  crossColor: "#00ffcc",
  textureWidth: 512,
  textureHeight: 512,
  spriteScale: 1.8,
  distance: 1.8,
  circleRadiusFraction: 0.42,
  circleLineWidth: 2.5,
  crossArmLength: 30,
  crossGap: 7,
  crossLineWidth: 1.5,
  crossTickSize: 7,
};

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

  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.sprite);
    this.sprite.position.set(0, 0, -SONAR.distance);
    this.sprite.scale.set(SONAR.spriteScale, SONAR.spriteScale, 1);
  }

  update(): void {
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

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
    this._drawCircle(ctx, cx, cy, radius);
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

  private _drawCrosshair(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
  ): void {
    const arm = SONAR.crossArmLength;
    const gap = SONAR.crossGap;
    const tick = SONAR.crossTickSize;
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

    ctx.shadowBlur = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const innerR = i % 3 === 0 ? arm + 5 : arm + 3;
      const outerR = innerR + (i % 3 === 0 ? tick * 1.2 : tick * 0.7);
      const x1 = cx + Math.cos(a) * innerR;
      const y1 = cy + Math.sin(a) * innerR;
      const x2 = cx + Math.cos(a) * outerR;
      const y2 = cy + Math.sin(a) * outerR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

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
