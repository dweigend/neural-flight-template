import * as THREE from "three";

// ══════════════════════════════════════════════════════════════════
// SETTINGS — edit these, save, then refresh the browser
// ══════════════════════════════════════════════════════════════════

export const CYBER = {
  // ── Visuals ─────────────────────────────────────────────────────
  color: "#ff44aa", // Colour of the border lines and the text (hex, rgb, or named)
  glowPercent: 50, // Glow intensity 0–100 (0 = no glow, 100 = max glow)
  fontSize: 40, // Text size in canvas pixels
  fontWeight: "bold", // Text thickness: "normal", "bold", or "100"–"900"
  lineThickness: 2.5, // Thickness of the rectangle border lines (canvas px)
  fontFamily: "monospace", // Font family
  opacity: 1, // Opacity 0–1 (0 = invisible, 1 = fully opaque)

  // ── Texture ─────────────────────────────────────────────────────
  textureWidth: 480, // Canvas width in pixels (higher = sharper, more GPU memory)
  textureHeight: 130, // Canvas height in pixels

  // ── Grid layout ─────────────────────────────────────────────────
  gridRows: 4, // Number of rows
  gridColumns: 4, // Number of columns
  gridGapFraction: 0.1, // Gap between rectangles (fraction of smaller cell dimension)
  gridCoverageWidth: 0.95, // Fraction of viewport width the grid fills (0–1)
  gridCoverageHeight: 0.85, // Fraction of viewport height the grid fills (0–1)
  gridDistance: 1.8, // Distance from camera in world units (higher = smaller on screen)

  // ── Message & Languages ─────────────────────────────────────────
  message: "HELLO", // The word displayed in every rectangle (translated per language)

  // Language per grid slot. Each sub-array is one row (left→right, top→bottom).
  // Shape must match gridRows × gridColumns.
  languages: [
    ["German",          "Turkish",         "Arabic",          "English"],
    ["Russian",         "Polish",          "Vietnamese",      "Kurdish"],
    ["Romanian",        "Bulgarian",       "French",          "Persian"],
    ["Serbian",         "Spanish",         "Portuguese",      "Mandarin Chinese"],
  ],

  // Per-slot override — same shape as languages. null = use dictionary.
  textOverrides: [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ],
};

// ── Translation Dictionary ───────────────────────────────────────
// Add new messages and languages here. Keys are uppercase messages.
const TRANSLATIONS: Record<string, Record<string, string>> = {
  HELLO: {
    German: "HALLO",
    Turkish: "MERHABA",
    Arabic: "مرحبا",
    English: "HELLO",
    Russian: "Здравствуйте",
    Polish: "CZEŚĆ",
    Vietnamese: "XIN CHÀO",
    Kurdish: "SILAV",
    Romanian: "BUNĂ",
    Bulgarian: "ЗДРАВЕЙ",
    French: "BONJOUR",
    Persian: "سلام",
    Serbian: "ЗДРАВО",
    Spanish: "HOLA",
    Portuguese: "OLÁ",
    "Mandarin Chinese": "你好",
    Italian: "CIAO",
    Chinese: "你好",
    Japanese: "こんにちは",
    Korean: "안녕하세요",
    Dutch: "HALLO",
    Swedish: "HEJ",
    Greek: "ΓΕΙΑ",
    Hindi: "नमस्ते",
    Thai: "สวัสดี",
  },
  WELCOME: {
    German: "WILLKOMMEN",
    Turkish: "HOŞ GELDİNİZ",
    Arabic: "أهلاً وسهلاً",
    English: "WELCOME",
    Russian: "Добро пожаловать",
    Polish: "WITAJ",
    Vietnamese: "CHÀO MỪNG",
    Kurdish: "BI XÊR HATÎ",
    Romanian: "BUN VENIT",
    Bulgarian: "ДОБРЕ ДОШЛИ",
    French: "BIENVENUE",
    Persian: "خوش آمدید",
    Serbian: "ДОБРО ДОШЛИ",
    Spanish: "BIENVENIDO",
    Portuguese: "BEM-VINDO",
    "Mandarin Chinese": "欢迎",
    Italian: "BENVENUTO",
    Chinese: "欢迎",
    Japanese: "ようこそ",
    Korean: "환영합니다",
  },
  GOODBYE: {
    German: "TSCHÜSS",
    Turkish: "HOŞÇA KAL",
    Arabic: "مع السلامة",
    English: "GOODBYE",
    Russian: "До свидания",
    Polish: "DO WIDZENIA",
    Vietnamese: "TẠM BIỆT",
    Kurdish: "BI XATIRÊ",
    Romanian: "LA REVEDERE",
    Bulgarian: "ДОВИЖДАНЕ",
    French: "AU REVOIR",
    Persian: "خداحافظ",
    Serbian: "ДОВИЂЕЊА",
    Spanish: "ADIÓS",
    Portuguese: "TCHAU",
    "Mandarin Chinese": "再见",
    Italian: "ARRIVEDERCI",
    Chinese: "再见",
    Japanese: "さようなら",
    Korean: "안녕",
  },
  THANKS: {
    German: "DANKE",
    Turkish: "TEŞEKKÜRLER",
    Arabic: "شكراً",
    English: "THANKS",
    Russian: "Спасибо",
    Polish: "DZIĘKUJĘ",
    Vietnamese: "CẢM ƠN",
    Kurdish: "SPAS",
    Romanian: "MULȚUMESC",
    Bulgarian: "БЛАГОДАРЯ",
    French: "MERCI",
    Persian: "متشکرم",
    Serbian: "ХВАЛА",
    Spanish: "GRACIAS",
    Portuguese: "OBRIGADO",
    "Mandarin Chinese": "谢谢",
    Italian: "GRAZIE",
    Chinese: "谢谢",
    Japanese: "ありがとう",
    Korean: "감사합니다",
  },
};

function lookupTranslation(message: string, language: string): string | null {
  const langMap = TRANSLATIONS[message.toUpperCase()];
  return langMap?.[language] ?? null;
}

/** Compute the actual displayed texts from CYBER config + dictionary */
export function getTexts(): string[] {
  const langs = CYBER.languages.flat();
  const overrides = CYBER.textOverrides.flat();
  return langs.map(
    (lang, i) =>
      overrides[i] ??
      lookupTranslation(CYBER.message, lang) ??
      CYBER.message,
  );
}

/** Read-only reference — shows what each slot will display (auto-computed) */
export const COMPUTED_TEXTS: readonly string[] = getTexts();

// ══════════════════════════════════════════════════════════════════
// CyberOverlay — one rectangle outline + text, camera-aligned
// ══════════════════════════════════════════════════════════════════

export class CyberOverlay {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _text: string;
  private _overrides: Partial<{
    color: string;
    glowPercent: number;
    fontSize: number;
    fontWeight: string;
    lineThickness: number;
    fontFamily: string;
    opacity: number;
  }> | null;

  constructor(
    text: string,
    overrides?: Partial<{
      color: string;
      glowPercent: number;
      fontSize: number;
      fontWeight: string;
      lineThickness: number;
      fontFamily: string;
      opacity: number;
    }>,
  ) {
    this._text = text;
    this._overrides = overrides ?? null;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CYBER.textureWidth;
    this.canvas.height = CYBER.textureHeight;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: CYBER.opacity,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.renderOrder = 999;
    this.sprite.frustumCulled = false;

    this.draw();
  }

  /** Add sprite as camera child and position in screen-relative coords */
  attachToCamera(
    camera: THREE.Camera,
    x: number,
    y: number,
    distance: number = CYBER.gridDistance,
  ): void {
    camera.add(this.sprite);
    this.sprite.position.set(x, y, -distance);
  }

  /** Change text and re-draw */
  setText(text: string): void {
    this._text = text;
    this.draw();
  }

  /** Get current text */
  getText(): string {
    return this._text;
  }

  /** Set per-instance visual overrides and re-draw */
  applyVisuals(
    overrides: Partial<{
      color: string;
      glowPercent: number;
      fontSize: number;
      fontWeight: string;
      lineThickness: number;
      fontFamily: string;
      opacity: number;
    }>,
  ): void {
    this._overrides = { ...this._overrides, ...overrides };
    if (overrides.opacity !== undefined) {
      this.sprite.material.opacity = overrides.opacity;
    }
    this.draw();
  }

  /** Re-draw from current CYBER + instance overrides */
  redraw(): void {
    this.draw();
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }

  // ── Internal ──

  private draw(): void {
    const { canvas, ctx } = this;
    const v = { ...CYBER, ...this._overrides };
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const glowPx = (v.glowPercent / 100) * 24;

    // Rectangle outline
    ctx.shadowColor = v.color;
    ctx.shadowBlur = glowPx;
    ctx.strokeStyle = v.color;
    ctx.lineWidth = v.lineThickness;
    const hl = v.lineThickness / 2;
    ctx.strokeRect(hl, hl, w - v.lineThickness, h - v.lineThickness);

    // Text
    ctx.font = `${v.fontWeight} ${v.fontSize}px ${v.fontFamily}`;
    ctx.fillStyle = v.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = glowPx;
    ctx.fillText(this._text, w / 2, h / 2);

    this.texture.needsUpdate = true;
  }
}

// ══════════════════════════════════════════════════════════════════
// Grid helper — creates N overlays arranged in rows/columns
// ══════════════════════════════════════════════════════════════════

/** Low-level: fixed-size grid (not viewport-responsive). Use createResponsiveGrid instead. */
export function createOverlayGrid(
  texts: readonly string[],
  config?: Partial<{
    rows: number;
    columns: number;
    gapWorld: number;
    scaleX: number;
    scaleY: number;
    distance: number;
    overrides: Partial<{
      color: string;
      glowPercent: number;
      fontSize: number;
      fontWeight: string;
      lineThickness: number;
      fontFamily: string;
      opacity: number;
    }>;
  }>,
): CyberOverlay[] {
  const c = {
    rows: 2,
    columns: 4,
    gapWorld: 0.15,
    scaleX: 0.55,
    scaleY: 0.16,
    distance: 1.8,
    ...config,
  };
  const overlays = texts.map((t) => new CyberOverlay(t, c.overrides));

  applyGridLayout(
    overlays,
    c.rows,
    c.columns,
    c.gapWorld,
    c.scaleX,
    c.scaleY,
    c.distance,
  );

  return overlays;
}

/** Reposition existing overlays in a fixed-size grid */
export function applyGridLayout(
  overlays: readonly CyberOverlay[],
  rows: number,
  columns: number,
  gapWorld: number = 0.15,
  scaleX: number = 0.55,
  scaleY: number = 0.16,
  distance: number = 1.8,
): void {
  const count = overlays.length;
  const r = Math.min(rows, count);
  const cols = Math.ceil(count / r);

  overlays.forEach((ov, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = (col - (cols - 1) / 2) * (scaleX + gapWorld);
    const y = ((r - 1) / 2 - row) * (scaleY + gapWorld);

    ov.sprite.position.set(x, y, -distance);
    ov.sprite.scale.set(scaleX, scaleY, 1);
  });
}

/** Re-draw all overlays from current CYBER config */
export function redrawAll(overlays: readonly CyberOverlay[]): void {
  for (const ov of overlays) ov.redraw();
}

// ══════════════════════════════════════════════════════════════════
// Responsive grid — sizes overlays to fill a fraction of the viewport
// ══════════════════════════════════════════════════════════════════

function visibleSizeAtDistance(
  camera: THREE.PerspectiveCamera,
  distance: number,
): { width: number; height: number } {
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * distance * Math.tan(vFov / 2);
  const width = height * camera.aspect;
  return { width, height };
}

export function createResponsiveGrid(
  texts: readonly string[],
  camera: THREE.PerspectiveCamera,
  config?: Partial<{
    rows: number;
    columns: number;
    gapFraction: number;
    coverageWidth: number;
    coverageHeight: number;
    distance: number;
    overrides: Partial<{
      color: string;
      glowPercent: number;
      fontSize: number;
      fontWeight: string;
      lineThickness: number;
      fontFamily: string;
      opacity: number;
    }>;
  }>,
): CyberOverlay[] {
  const c = {
    rows: CYBER.gridRows,
    columns: CYBER.gridColumns,
    gapFraction: CYBER.gridGapFraction,
    coverageWidth: CYBER.gridCoverageWidth,
    coverageHeight: CYBER.gridCoverageHeight,
    distance: CYBER.gridDistance,
    ...config,
  };

  const overlays = texts.map((t) => new CyberOverlay(t, c.overrides));

  applyResponsiveLayout(
    overlays,
    camera,
    c.rows,
    c.columns,
    c.gapFraction,
    c.coverageWidth,
    c.coverageHeight,
    c.distance,
  );

  return overlays;
}

/** Reposition overlays to fill viewport — call on resize */
export function applyResponsiveLayout(
  overlays: readonly CyberOverlay[],
  camera: THREE.PerspectiveCamera,
  rows: number = CYBER.gridRows,
  columns: number = CYBER.gridColumns,
  gapFraction: number = CYBER.gridGapFraction,
  coverageWidth: number = CYBER.gridCoverageWidth,
  coverageHeight: number = CYBER.gridCoverageHeight,
  distance: number = CYBER.gridDistance,
): void {
  const count = overlays.length;
  const r = Math.min(rows, count);
  const cols = Math.ceil(count / r);

  const view = visibleSizeAtDistance(camera, distance);
  const availW = view.width * coverageWidth;
  const availH = view.height * coverageHeight;

  const cellW = availW / cols;
  const cellH = availH / r;

  const gap = Math.min(cellW, cellH) * gapFraction;
  const scaleX = cellW - gap;
  const scaleY = cellH - gap;

  overlays.forEach((ov, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = (col - (cols - 1) / 2) * cellW;
    const y = ((r - 1) / 2 - row) * cellH;

    ov.sprite.position.set(x, y, -distance);
    ov.sprite.scale.set(scaleX, scaleY, 1);
  });
}
