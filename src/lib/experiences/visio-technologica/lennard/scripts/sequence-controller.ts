import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import {
  CyberOverlay,
  createResponsiveGrid,
  getTexts,
  CYBER,
} from "./cyber-overlay";
import { SonarOverlay } from "./sonar-overlay";
import { BatteryOverlay } from "./battery-overlay";

// ══════════════════════════════════════════════════════════════════
// SETTINGS — configure your sequence here
// ══════════════════════════════════════════════════════════════════

export const SEQ = {
  /** Seconds to fade out overlays when the last stage ends (0 = instant) */
  fadeOutSeconds: 0.5,

  /** Seconds between each overlay popping up (0 = all at once) */
  staggerSeconds: 0.3,

  /** Seconds each overlay takes to fade in (0 = instant pop) */
  staggerFadeSeconds: 0.3,

  /** Seconds each overlay takes to fade out old text before switching (0 = instant) */
  staggerFadeOutSeconds: 0.2,

  /** Randomize the order overlays pop up / switch text (false = left-to-right, top-to-bottom) */
  staggerRandomOrder: true,

  /** Seconds to wait after sonar fade-out completes before advancing to the next stage */
  sonarFadeOutDelay: 1.5,

  /** Blink settings for the "blink" cyber stage */
  blinkOnDuration: 1, // Seconds the overlays are visible per blink cycle
  blinkOffDuration: 0.5, // Seconds the overlays are hidden per blink cycle

  /** Prequel overlay shown before the main sequence (not yet created) */
  prequel: {
    enabled: false,
    message: "VISION",
    durationSeconds: 5,
    factory: "prequel" as const,
  },

  /** Ordered list of overlay stages */
  stages: [
    {
      factory: "sonar" as const,
      message: "",
      durationSeconds: 20,
    },
    {
      factory: "cyber" as const,
      message: "HUMAN PERCEPTION DETECTED",
      durationSeconds: 10,
    },
    {
      factory: "cyber" as const,
      message: "SWITCHING TO\nTECHNOLOGICAL PERCEPTION",
      durationSeconds: 6,
    },
    {
      factory: "battery" as const,
      message: "",
      durationSeconds: 50,
    },
    {
      factory: "blink" as const,
      message: "TURNING OFF\nTECHNOLOGICAL PERCEPTION",
      durationSeconds: 10,
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
) => {
  overlays: CyberOverlay[];
  dispose: () => void;
  /** Optional sonar instance, set by the "sonar" factory */
  _sonar?: SonarOverlay;
  /** Optional battery instance, set by the "battery" factory */
  _battery?: BatteryOverlay;
};

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

  sonar(_message, camera) {
    const sonar = new SonarOverlay();
    sonar.attachToCamera(camera);
    return {
      overlays: [],
      dispose() {
        camera.remove(sonar.sprite);
        sonar.dispose();
      },
      _sonar: sonar,
    };
  },

  battery(_message, camera) {
    const battery = new BatteryOverlay();
    battery.attachToCamera(camera);
    battery.start();
    return {
      overlays: [],
      dispose() {
        camera.remove(battery.sprite);
        battery.dispose();
      },
      _battery: battery,
    };
  },

  blink(message, camera) {
    const prev = CYBER.message;
    CYBER.message = message;
    const texts = getTexts();
    CYBER.message = prev;
    const overlays = createResponsiveGrid(texts, camera);
    for (const ov of overlays) camera.add(ov.sprite);
    return {
      overlays,
      dispose() {
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
  private active: {
    dispose: () => void;
    overlays: CyberOverlay[];
    _sonar?: SonarOverlay;
    _battery?: BatteryOverlay;
  } | null = null;
  private state: StageState;
  private onEvent?: (event: SeqEvent, state: StageState) => void;
  private _running = false;
  private _completed = false;
  private _fadeElapsed = 0;
  private _sonarFadePending = false;
  private _sonarFadeDoneTime = 0;
  private _blinkElapsed = 0;
  private shuffledIndices: number[] = [];
  private textSwitched: Set<number> = new Set();
  private stageTexts: string[] = [];
  private oldTexts: string[] = [];
  private staggerPhase: "popin" | "switch" | "fadeout" | "transitionFade" =
    "popin";

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
    return this.staggerPhase === "fadeout";
  }

  get currentState(): Readonly<StageState> {
    return this.state;
  }

  start(): void {
    this.stop();
    this._running = true;
    this._completed = false;
    this._fadeElapsed = 0;
    this._blinkElapsed = 0;

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
    this._fadeElapsed = 0;
    this._sonarFadePending = false;
    this.staggerPhase = "popin";
    this.restoreOpacity();
    this.unloadCurrent();
  }

  update(delta: number): void {
    if (!this._running || this._completed) return;

    // ── If waiting for sonar fade-out to finish, poll for completion ──
    if (this._sonarFadePending) {
      const sonar = this.active?._sonar;
      if (sonar) {
        sonar.update(); // Keep driving the fade-out animation
        if (sonar.isFadedOut) {
          // Once faded out, start the delay timer on first detection
          if (this._sonarFadeDoneTime === 0) {
            this._sonarFadeDoneTime = performance.now();
          }
          const delayMs = SEQ.sonarFadeOutDelay * 1000;
          if (performance.now() - this._sonarFadeDoneTime >= delayMs) {
            this._sonarFadePending = false;
            this._sonarFadeDoneTime = 0;
            this.unloadCurrent();
            this.advanceToNext();
          }
        }
      } else {
        this._sonarFadePending = false;
        this.unloadCurrent();
        this.advanceToNext();
      }
      return;
    }

    // Drive the sonar/battery update loops while active
    this.active?._sonar?.update();
    this.active?._battery?.update(performance.now());

    if (this.staggerPhase === "transitionFade") {
      this._fadeElapsed += delta;
      this.applyStagger();
      const overlays = this.active?.overlays;
      if (overlays && overlays.length > 0) {
        const lastPos = Math.max(...this.shuffledIndices);
        const totalDuration = lastPos * SEQ.staggerSeconds + SEQ.fadeOutSeconds;
        if (this._fadeElapsed >= totalDuration) {
          this.staggerPhase = "popin";
          this.advanceToNext();
        }
      } else {
        this.staggerPhase = "popin";
        this.advanceToNext();
      }
      return;
    }

    if (this.staggerPhase === "fadeout") {
      this._fadeElapsed += delta;
      this.applyStagger();
      const overlays = this.active?.overlays;
      if (overlays && overlays.length > 0) {
        const lastPos = Math.max(...this.shuffledIndices);
        const totalDuration = lastPos * SEQ.staggerSeconds + SEQ.fadeOutSeconds;
        if (this._fadeElapsed >= totalDuration) {
          this._completed = true;
          this._running = false;
          this.unloadCurrent();
          this.onEvent?.("complete", { ...this.state });
        }
      } else {
        this._completed = true;
        this._running = false;
        this.onEvent?.("complete", { ...this.state });
      }
      return;
    }

    this.applyStagger();

    // ── Blink stage: all overlays blink on/off simultaneously ──
    if (this.state.factory === "blink") {
      this._blinkElapsed += delta;
      const cycleDuration = SEQ.blinkOnDuration + SEQ.blinkOffDuration;
      const pos = this._blinkElapsed % cycleDuration;
      const on = pos < SEQ.blinkOnDuration;
      const overlays = this.active?.overlays;
      if (overlays) {
        for (const ov of overlays) {
          ov.sprite.material.opacity = on ? CYBER.opacity : 0;
        }
      }
    }

    this.state.elapsed += delta;

    if (this.state.elapsed < this.state.duration) return;

    this.onEvent?.("stageEnd", { ...this.state });

    if (this.state.index === -1) {
      this.advanceTo(0);
    } else if (this.state.index < SEQ.stages.length - 1) {
      const nextFactory = SEQ.stages[this.state.index + 1].factory;

      // ── Sonar stage: start fade-out and wait for completion ──
      if (this.state.factory === "sonar") {
        const sonar = this.active?._sonar;
        if (sonar) {
          sonar.startFadeOut();
          this._sonarFadePending = true;
        } else {
          if (nextFactory === this.state.factory) {
            this.advanceToNext();
          } else {
            this.startTransitionFade();
          }
        }
      } else if (nextFactory === this.state.factory) {
        // Same factory — switch texts directly (outlines stay)
        this.advanceToNext();
      } else {
        // Different factory — fade out current overlays first
        this.startTransitionFade();
      }
    } else {
      // ── Last stage — handle potential sonar fade-out ──
      if (this.state.factory === "sonar") {
        const sonar = this.active?._sonar;
        if (sonar) {
          sonar.startFadeOut();
          this._sonarFadePending = true;
          return;
        }
      }
      if (SEQ.fadeOutSeconds > 0) {
        this._fadeElapsed = 0;
        this.staggerPhase = "fadeout";
      } else {
        this._completed = true;
        this._running = false;
        this.unloadCurrent();
        this.onEvent?.("complete", { ...this.state });
      }
    }
  }

  private advanceTo(stageIndex: number): void {
    const stage = SEQ.stages[stageIndex];
    const prev = CYBER.message;
    CYBER.message = stage.message;
    const texts = getTexts();
    CYBER.message = prev;

    if (
      this.active &&
      this.state.factory === stage.factory &&
      texts.length === this.active.overlays.length
    ) {
      this.state = {
        index: stageIndex,
        factory: stage.factory,
        message: stage.message,
        duration: stage.durationSeconds,
        elapsed: 0,
      };
      this.switchTexts(texts);
      this.onEvent?.("stageStart", { ...this.state });
    } else {
      this.unloadCurrent();
      this.state = {
        index: stageIndex,
        factory: stage.factory,
        message: stage.message,
        duration: stage.durationSeconds,
        elapsed: 0,
      };
      this.loadCurrent();
    }
  }

  private advanceToNext(): void {
    this.advanceTo(this.state.index + 1);
  }

  private startTransitionFade(): void {
    if (!this.active || this.active.overlays.length === 0) {
      this.advanceToNext();
      return;
    }
    this._fadeElapsed = 0;
    this.staggerPhase = "transitionFade";
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
    this.shuffledIndices = this.shuffleIndices(result.overlays.length);
    this.textSwitched.clear();
    this.staggerPhase = "popin";
    if (SEQ.staggerSeconds > 0 && result.overlays.length > 0) {
      for (const ov of result.overlays) {
        ov.sprite.material.opacity = 0;
      }
    }
    this.onEvent?.("stageStart", { ...this.state });
  }

  private unloadCurrent(): void {
    this.active?.dispose();
    this.active = null;
  }

  private shuffleIndices(count: number): number[] {
    const indices = Array.from({ length: count }, (_, i) => i);
    if (!SEQ.staggerRandomOrder) return indices;
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  private switchTexts(texts: string[]): void {
    this.oldTexts = this.active
      ? this.active.overlays.map((ov) => ov.getText())
      : [];
    this.stageTexts = [...texts];
    this.shuffledIndices = this.shuffleIndices(texts.length);
    this.textSwitched.clear();
    this.staggerPhase = "switch";
  }

  private applyStagger(): void {
    if (!this.active || SEQ.staggerSeconds <= 0) return;
    const elapsed = this.state.elapsed;
    const overlays = this.active.overlays;
    const fadeOut = SEQ.staggerFadeOutSeconds;
    const fadeIn = SEQ.staggerFadeSeconds;

    if (
      this.staggerPhase === "fadeout" ||
      this.staggerPhase === "transitionFade"
    ) {
      for (let i = 0; i < overlays.length; i++) {
        const pos = this.shuffledIndices[i] ?? i;
        const fadeAt = pos * SEQ.staggerSeconds;
        const remain = this._fadeElapsed - fadeAt;
        if (remain < 0) {
          overlays[i].sprite.material.opacity = CYBER.opacity;
        } else if (remain < SEQ.fadeOutSeconds) {
          const t = remain / SEQ.fadeOutSeconds;
          overlays[i].sprite.material.opacity = (1 - t) * CYBER.opacity;
        } else {
          overlays[i].sprite.material.opacity = 0;
        }
      }
    } else if (this.staggerPhase === "switch") {
      for (let i = 0; i < overlays.length; i++) {
        const pos = this.shuffledIndices[i] ?? i;
        const switchAt = pos * SEQ.staggerSeconds;
        const remain = elapsed - switchAt;

        if (remain < 0) continue;

        if (!this.textSwitched.has(i)) {
          this.textSwitched.add(i);
        }

        if (fadeOut > 0 && remain < fadeOut) {
          overlays[i].drawTextFade(
            this.oldTexts[i] ?? "",
            1 - remain / fadeOut,
          );
        } else if (fadeIn > 0 && remain < fadeOut + fadeIn) {
          overlays[i].drawTextFade(
            this.stageTexts[i],
            (remain - fadeOut) / fadeIn,
          );
        } else {
          overlays[i].setText(this.stageTexts[i]);
        }
      }
    } else {
      for (let i = 0; i < overlays.length; i++) {
        const pos = this.shuffledIndices[i] ?? i;
        const revealAt = pos * SEQ.staggerSeconds;
        if (elapsed < revealAt) {
          overlays[i].sprite.material.opacity = 0;
        } else if (fadeIn > 0 && elapsed < revealAt + fadeIn) {
          const t = (elapsed - revealAt) / fadeIn;
          overlays[i].sprite.material.opacity = t * CYBER.opacity;
        } else {
          overlays[i].sprite.material.opacity = CYBER.opacity;
        }
      }
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
