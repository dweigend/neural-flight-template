import {
	HELICOPTER_CONTROLLER_DEFAULTS,
	type FlightOrientationMessage,
	type HelicopterControllerConfig,
	type HelicopterControllerStep,
} from "./types";

const DEG2RAD = Math.PI / 180;

export class HelicopterController {
	private config: HelicopterControllerConfig;
	private speed = 0;
	private heading = 0;
	private targetPitch = 0;
	private targetRoll = 0;
	private currentPitch = 0;
	private currentRoll = 0;
	private liftInput = 0;

	constructor(config?: Partial<HelicopterControllerConfig>) {
		this.config = { ...HELICOPTER_CONTROLLER_DEFAULTS, ...config };
	}

	setConfig(config: Partial<HelicopterControllerConfig>): void {
		this.config = { ...this.config, ...config };
		this.speed = clamp(this.speed, 0, this.config.maxSpeed);
	}

	updateOrientation(message: FlightOrientationMessage): void {
		if (!Number.isFinite(message.pitch) || !Number.isFinite(message.roll)) return;
		this.targetPitch = clamp(message.pitch, -this.config.maxPitchDegrees, this.config.maxPitchDegrees);
		this.targetRoll = clamp(message.roll, -this.config.maxRollDegrees, this.config.maxRollDegrees);
	}

	updateLiftInput(value: number): void {
		if (!Number.isFinite(value)) return;
		this.liftInput = clamp(value, -1, 1);
	}

	scaleSpeed(factor: number): void {
		if (!Number.isFinite(factor) || factor <= 0) return;
		this.speed = clamp(this.speed * factor, 0, this.config.maxSpeed);
	}

	tick(delta: number): HelicopterControllerStep {
		if (!Number.isFinite(delta) || delta <= 0) {
			return this.createStep(0, 0);
		}

		this.currentPitch +=
			(this.targetPitch - this.currentPitch) * this.config.smoothingAlpha;
		this.currentRoll +=
			(this.targetRoll - this.currentRoll) * this.config.smoothingAlpha;

		const pitch = applyDeadzone(this.currentPitch, this.config.pitchDeadzoneDegrees);
		const roll = applyDeadzone(this.currentRoll, this.config.rollDeadzoneDegrees);
		const pitchRatio = pitch / this.config.maxPitchDegrees;
		const rollRatio = roll / this.config.maxRollDegrees;

		if (pitchRatio > 0) {
			this.speed += pitchRatio * this.config.accelerationRate * delta;
		} else if (pitchRatio < 0) {
			this.speed -= Math.abs(pitchRatio) * this.config.brakeRate * delta;
		}

		this.speed -= this.config.dragRate * delta;
		this.speed = clamp(this.speed, 0, this.config.maxSpeed);
		this.heading -= rollRatio * this.config.rollYawMultiplier * delta;

		return this.createStep(pitch, roll);
	}

	reset(): void {
		this.speed = 0;
		this.heading = 0;
		this.targetPitch = 0;
		this.targetRoll = 0;
		this.currentPitch = 0;
		this.currentRoll = 0;
		this.liftInput = 0;
	}

	dispose(): void {
		this.reset();
	}

	private createStep(pitch: number, roll: number): HelicopterControllerStep {
		return {
			heading: this.heading,
			speed: this.speed,
			forwardDistance: this.speed,
			verticalDelta: this.liftInput * this.config.liftSpeed,
			pitchRadians: pitch * DEG2RAD * this.config.visualPitchFactor,
			rollRadians: roll * DEG2RAD * this.config.visualRollFactor,
		};
	}
}

function applyDeadzone(value: number, deadzone: number): number {
	if (Math.abs(value) <= deadzone) return 0;
	return value;
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}
