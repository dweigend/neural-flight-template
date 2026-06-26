import * as THREE from "three";
import { DEFAULT_HEIGHTMAP, getHeight } from "$lib/three/terrain/heightmap";
import type { OrientationData, SpeedCommand } from "$lib/types/orientation";

const DEG2RAD = Math.PI / 180;

export interface FlightPlayerConfig {
	fov?: number;
	near?: number;
	far?: number;
	spawnPosition?: { x: number; y: number; z: number };
	baseSpeed?: number;
	terrainSlowdown?: number;
}

const DEFAULTS: Required<FlightPlayerConfig> = {
	fov: 75,
	near: 0.1,
	far: 1000,
	spawnPosition: { x: 0, y: 50, z: 0 },
	baseSpeed: 20,
	terrainSlowdown: 0.7,
};

/**
 * Flight player — rig with camera, driven by pitch/roll + speed commands.
 *
 * All tuning properties (baseSpeed, lerpAlpha, rollYawMultiplier, minClearance)
 * are mutable and can be updated by applySettings() at runtime.
 */
export class FlightPlayer {
	readonly rig: THREE.Group;
	readonly cameraMount: THREE.Group;
	readonly camera: THREE.PerspectiveCamera;

	velocity: number;
	private readonly terrainSlowdown: number;
	private targetPitch = 0;
	private targetRoll = 0;
	private currentPitch = 0;
	private currentRoll = 0;
	private heading = 0;
	private accelerating = false;
	private braking = false;
	private xrPresenting = false;

	/** Mutable flight parameters — set via applySettings */
	baseSpeed: number;
	lerpAlpha = 0.15;
	rollYawMultiplier = 1.5;
	minClearance = 8;

	constructor(config?: FlightPlayerConfig) {
		const c = { ...DEFAULTS, ...config };

		this.baseSpeed = c.baseSpeed;
		this.velocity = c.baseSpeed;
		this.terrainSlowdown = c.terrainSlowdown;

		this.camera = new THREE.PerspectiveCamera(c.fov, 1, c.near, c.far);
		this.cameraMount = new THREE.Group();
		this.rig = new THREE.Group();
		this.rig.position.set(
			c.spawnPosition.x,
			c.spawnPosition.y,
			c.spawnPosition.z,
		);
		this.cameraMount.add(this.camera);
		this.rig.add(this.cameraMount);
	}

	updateOrientation(data: OrientationData): void {
		this.targetPitch = data.pitch;
		this.targetRoll = data.roll;
	}

	updateSpeed(cmd: SpeedCommand): void {
		if (cmd.action === "accelerate") this.accelerating = cmd.active;
		if (cmd.action === "brake") this.braking = cmd.active;
	}

	setXRPresenting(active: boolean): void {
		this.xrPresenting = active;
	}

	tick(delta: number): void {
		this.currentPitch +=
			(this.targetPitch - this.currentPitch) * this.lerpAlpha;
		this.currentRoll += (this.targetRoll - this.currentRoll) * this.lerpAlpha;

		this.updateVelocity();

		const pitchRad = this.currentPitch * DEG2RAD;
		const rollRad = this.currentRoll * DEG2RAD;

		// Heading accumulates from roll (banking turns the plane).
		this.heading -= rollRad * this.rollYawMultiplier * delta;

		// Forward vector from spherical coordinates (heading + pitch).
		const forward = new THREE.Vector3(
			-Math.sin(this.heading) * Math.cos(pitchRad),
			-Math.sin(pitchRad),
			-Math.cos(this.heading) * Math.cos(pitchRad),
		);
		this.rig.position.addScaledVector(forward, this.velocity * delta);
		this.updateCameraMountRotation(pitchRad, rollRad);

		this.clampToTerrain();
	}

	tickDirectYaw(delta: number, pitch: number, yaw: number, roll = 0): void {
		this.currentPitch = pitch;
		this.currentRoll = roll;
		this.targetPitch = pitch;
		this.targetRoll = roll;
		this.heading = yaw * DEG2RAD;

		this.updateVelocity();

		const pitchRad = pitch * DEG2RAD;
		const rollRad = roll * DEG2RAD;
		const forward = new THREE.Vector3(
			-Math.sin(this.heading) * Math.cos(pitchRad),
			-Math.sin(pitchRad),
			-Math.cos(this.heading) * Math.cos(pitchRad),
		);

		this.rig.position.addScaledVector(forward, this.velocity * delta);
		this.updateCameraMountRotation(pitchRad, rollRad);

		this.clampToTerrain();
	}

	private updateCameraMountRotation(
		pitchRad: number,
		rollRad: number,
	): void {
		if (this.xrPresenting) {
			this.cameraMount.rotation.set(0, 0, 0, "YXZ");
			return;
		}

		// YXZ Euler order: apply Yaw first, then Pitch, then Roll.
		// This prevents gimbal-lock artifacts that occur with default XYZ in flight sims.
		this.cameraMount.rotation.set(-pitchRad, this.heading, -rollRad, "YXZ");
	}

	private updateVelocity(): void {
		if (this.accelerating) {
			this.velocity = this.baseSpeed * 2; // 2× boost while accelerating
		} else if (this.braking) {
			this.velocity = this.baseSpeed * 0.25; // 25% speed while braking
		} else {
			this.velocity = this.baseSpeed;
		}
	}

	private clampToTerrain(): void {
		const terrainY = getHeight(
			this.rig.position.x,
			this.rig.position.z,
			DEFAULT_HEIGHTMAP,
		);
		const minY = terrainY + this.minClearance;
		if (this.rig.position.y < minY) {
			this.rig.position.y = minY;
			this.velocity *= this.terrainSlowdown;
		}
	}
}
