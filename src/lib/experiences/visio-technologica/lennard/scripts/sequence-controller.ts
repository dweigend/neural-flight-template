import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import {
  CyberOverlay,
  createResponsiveGrid,
  getTexts,
  CYBER,
} from "./cyber-overlay";

// ══════════════════════════════════════════════════════════════════
// SETTINGS — configure your sequence here
// ══════════════════════════════════════════════════════════════════

export const SEQ = {
  /** Seconds to fade out overlays when the last stage ends (0 = instant) */
  fadeOutSeconds: 1.5,

  /** Prequel overlay shown before the main sequence (not yet created) */
  prequel: {
    enabled: true,
    message: "VISION",
    durationSeconds: 5,
    /** Which overlay factory to use for the prequel */
    factory: "prequel" as const,
  },

  /** Ordered list of overlay stages */
  stages: [
    {
      factory: "cyber" as const,
      message: "HUMAN PERCEPTION DETECTED",
      durationSeconds: 10,
    },
    {
      factory: "cyber" as const,
      message: "SWITCHING TO\nTECHNOLOGICAL PERCEPTION",
      durationSeconds: 8,
    },
  ],
};

export type StageFactory = (typeof SEQ.stages)[number]["factory"];
export type StageDef = (typeof SEQ.stages)[number];

// ══════════════════════════════════════════════════════════════════
// Overlay factory registry
// ══════════════════════════════════════════════════════════════════

export type OverlayFactoryFn = (
  message: string,
  camera: PerspectiveCamera,
) => { overlays: CyberOverlay[]; dispose: () => void };

const FACTORIES: Record<string, OverlayFactoryFn> = {
  cyber(message, camera) {
    const prev = CYBER.message;
    CYBER.message = message;
    const texts = getTexts();
    const overlays = createResponsiveGrid(texts, camera);
    for (const ov of overlays) camera.add(ov.sprite);
    return {
      overlays,
      dispose() {
        CYBER.message = prev;
        for (const ov of overlays) {
          camera.remove(ov.sprite);
          ov.dispose();
        }
      },
    };
  },

  /** Placeholder for the prequel overlay (not yet implemented) */
  prequel(message, camera) {
    const prev = CYBER.message;
    CYBER.message = message;
    const texts = getTexts();
    const overlays = createResponsiveGrid(texts, camera);
    for (const ov of overlays) camera.add(ov.sprite);
    return {
      overlays,
      dispose() {
        CYBER.message = prev;
        for (const ov of overlays) {
          camera.remove(ov.sprite);
          ov.dispose();
        }
      },
    };
  },
};

/** Register a custom overlay factory */
export function registerFactory(name: string, fn: OverlayFactoryFn): void {
  FACTORIES[name] = fn;
}

// ══════════════════════════════════════════════════════════════════
// SequenceController — runs through stages with timing
// ══════════════════════════════════════════════════════════════════

export interface StageState {
  index: number;
  factory: StageFactory | "prequel";
  message: string;
  duration: number;
  elapsed: number;
}

export type SeqEvent = "stageStart" | "stageEnd" | "complete";

export class SequenceController {
  private camera: PerspectiveCamera;
  private active: { dispose: () => void; overlays: CyberOverlay[] } | null = null;
  private state: StageState;
  private onEvent?: (event: SeqEvent, state: StageState) => void;
  private _running = false;
  private _completed = false;
  private _fading = false;
  private _fadeElapsed = 0;

  constructor(
    camera: PerspectiveCamera,
    onEvent?: (event: SeqEvent, state: StageState) => void,
  ) {
    this.camera = camera;
    this.onEvent = onEvent;
    this.state = this.emptyState();
  }

  get running(): boolean {
    return this._running;
  }

  get completed(): boolean {
    return this._completed;
  }

  get fading(): boolean {
    return this._fading;
  }

  get currentState(): Readonly<StageState> {
    return this.state;
  }

  start(): void {
    this.stop();
    this._running = true;
    this._completed = false;
    this._fading = false;

    if (SEQ.prequel.enabled) {
      this.state = {
        index: -1,
        factory: "prequel",
        message: SEQ.prequel.message,
        duration: SEQ.prequel.durationSeconds,
        elapsed: 0,
      };
      this.loadCurrent();
    } else {
      this.advanceTo(0);
    }
  }

  stop(): void {
    this._running = false;
    this._completed = false;
    this._fading = false;
    this.restoreOpacity();
    this.unloadCurrent();
  }

  update(delta: number): void {
    if (!this._running || this._completed) return;

    if (this._fading) {
      this._fadeElapsed += delta;
      const t = Math.min(this._fadeElapsed / SEQ.fadeOutSeconds, 1);
      this.setOverlayOpacity(1 - t);
      if (t >= 1) {
        this._fading = false;
        this._completed = true;
        this._running = false;
        this.unloadCurrent();
        this.onEvent?.("complete", { ...this.state });
      }
      return;
    }

    this.state.elapsed += delta;

    if (this.state.elapsed < this.state.duration) return;

    this.onEvent?.("stageEnd", { ...this.state });

    if (this.state.index === -1) {
      this.advanceTo(0);
    } else if (this.state.index < SEQ.stages.length - 1) {
      this.advanceTo(this.state.index + 1);
    } else {
      if (SEQ.fadeOutSeconds > 0) {
        this._fading = true;
        this._fadeElapsed = 0;
      } else {
        this._completed = true;
        this._running = false;
        this.unloadCurrent();
        this.onEvent?.("complete", { ...this.state });
      }
    }
  }

  private advanceTo(stageIndex: number): void {
    this.unloadCurrent();
    const stage = SEQ.stages[stageIndex];
    this.state = {
      index: stageIndex,
      factory: stage.factory,
      message: stage.message,
      duration: stage.durationSeconds,
      elapsed: 0,
    };
    this.loadCurrent();
  }

  private loadCurrent(): void {
    const fn = FACTORIES[this.state.factory];
    if (!fn) {
      console.warn(
        `[SequenceController] unknown factory: ${this.state.factory}`,
      );
      return;
    }
    const result = fn(this.state.message, this.camera) as {
      overlays: CyberOverlay[];
      dispose: () => void;
    };
    this.active = result;
    this.onEvent?.("stageStart", { ...this.state });
  }

  private unloadCurrent(): void {
    this.active?.dispose();
    this.active = null;
  }

  private setOverlayOpacity(alpha: number): void {
    if (!this.active) return;
    for (const ov of this.active.overlays) {
      ov.sprite.material.opacity = alpha;
    }
  }

  private restoreOpacity(): void {
    if (!this.active) return;
    for (const ov of this.active.overlays) {
      ov.sprite.material.opacity = CYBER.opacity;
    }
  }

  private emptyState(): StageState {
    return {
      index: -1,
      factory: "cyber",
      message: "",
      duration: 0,
      elapsed: 0,
    };
  }

  dispose(): void {
    this.stop();
  }
}
