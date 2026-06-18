import type { FlightPlayer } from "$lib/three/player";

const KEYBOARD_PITCH_DEGREES = 20;
const KEYBOARD_YAW_BANK_DEGREES = 30;
const ARROW_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright"]);

export interface KeyboardFlightControls {
  update(player: FlightPlayer): boolean;
  dispose(): void;
}

interface KeyState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function createKeyboardFlightControls(): KeyboardFlightControls | null {
  if (typeof window === "undefined") return null;

  return new BrowserKeyboardFlightControls(window);
}

class BrowserKeyboardFlightControls implements KeyboardFlightControls {
  private readonly keys: KeyState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private disposed = false;
  private needsNeutralUpdate = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.setKey(event, true);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.setKey(event, false);
  };

  private readonly onBlur = (): void => {
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
  };

  constructor(private readonly target: Window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  public update(player: FlightPlayer): boolean {
    if (this.disposed) return false;

    const hasActiveInput = this.hasActiveInput();
    if (!hasActiveInput && !this.needsNeutralUpdate) return false;

    const pitch = hasActiveInput ? this.getPitch() : 0;
    const yawBank = hasActiveInput ? this.getYawBank() : 0;
    this.needsNeutralUpdate = hasActiveInput;

    player.updateOrientation({
      type: "orientation",
      pitch,
      roll: yawBank,
      timestamp: Date.now(),
    });

    return hasActiveInput;
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    this.onBlur();
  }

  private setKey(event: KeyboardEvent, active: boolean): void {
    const key = event.key.toLowerCase();
    if (!ARROW_KEYS.has(key)) return;

    event.preventDefault();

    if (key === "arrowup") {
      this.keys.up = active;
      return;
    }

    if (key === "arrowdown") {
      this.keys.down = active;
      return;
    }

    if (key === "arrowleft") {
      this.keys.left = active;
      return;
    }

    this.keys.right = active;
  }

  private hasActiveInput(): boolean {
    return this.keys.up || this.keys.down || this.keys.left || this.keys.right;
  }

  private getPitch(): number {
    if (this.keys.up === this.keys.down) return 0;

    return this.keys.up ? -KEYBOARD_PITCH_DEGREES : KEYBOARD_PITCH_DEGREES;
  }

  private getYawBank(): number {
    if (this.keys.left === this.keys.right) return 0;

    return this.keys.left
      ? -KEYBOARD_YAW_BANK_DEGREES
      : KEYBOARD_YAW_BANK_DEGREES;
  }
}
