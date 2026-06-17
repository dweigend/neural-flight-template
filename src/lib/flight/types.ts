export interface FlightOrientationMessage {
	type: "orientation";
	pitch: number;
	roll: number;
	timestamp: number;
}

export interface HelicopterControllerConfig {
	maxSpeed: number;
	accelerationRate: number;
	brakeRate: number;
	dragRate: number;
	rollYawMultiplier: number;
	smoothingAlpha: number;
	maxPitchDegrees: number;
	maxRollDegrees: number;
	pitchDeadzoneDegrees: number;
	rollDeadzoneDegrees: number;
	visualPitchFactor: number;
	visualRollFactor: number;
	liftSpeed: number;
}

export interface HelicopterControllerStep {
	heading: number;
	speed: number;
	forwardDistance: number;
	verticalDelta: number;
	pitchRadians: number;
	rollRadians: number;
}

export interface LiftInput {
	value: number;
}

export const HELICOPTER_CONTROLLER_DEFAULTS: HelicopterControllerConfig = {
	maxSpeed: 20,
	accelerationRate: 40,
	brakeRate: 60,
	dragRate: 4,
	rollYawMultiplier: 1.5,
	smoothingAlpha: 0.15,
	maxPitchDegrees: 90,
	maxRollDegrees: 90,
	pitchDeadzoneDegrees: 0,
	rollDeadzoneDegrees: 0,
	visualPitchFactor: 1,
	visualRollFactor: 1,
	liftSpeed: 8,
};
