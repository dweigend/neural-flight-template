import * as THREE from "three";
import {
	HelicopterController,
	type HelicopterControllerConfig,
} from "$lib/flight";
import { DEFAULT_HEIGHTMAP, getHeight } from "$lib/three/terrain/heightmap";
import type { OrientationData, SpeedCommand } from "$lib/types/orientation";

export interface HelicopterPlayerConfig {
	fov?: number;
	near?: number;
	far?: number;
	spawnPosition?: { x: number; y: number; z: number };
	baseSpeed?: number;
	terrainSlowdown?: number;
	controller?: Partial<HelicopterControllerConfig>;
}

const DEFAULTS: Required<Omit<HelicopterPlayerConfig, "controller">> = {
	fov: 75,
	near: 0.1,
	far: 1000,
	spawnPosition: { x: 0, y: 50, z: 0 },
	baseSpeed: 20,
	terrainSlowdown: 0.7,
};

export class HelicopterPlayer {
	readonly rig: THREE.Group;
	readonly camera: THREE.PerspectiveCamera;

	velocity = 0;
	minClearance = 8;
	private readonly terrainSlowdown: number;
	private readonly controller: HelicopterController;
	private heldAltitude: number;
	private _baseSpeed: number;
	private _rollYawMultiplier: number;
	private _lerpAlpha: number;

	constructor(config?: HelicopterPlayerConfig) {
		const c = { ...DEFAULTS, ...config };
		this._baseSpeed = c.baseSpeed;
		this._rollYawMultiplier = c.controller?.rollYawMultiplier ?? 1.5;
		this._lerpAlpha = c.controller?.smoothingAlpha ?? 0.15;
		this.terrainSlowdown = c.terrainSlowdown;
		this.heldAltitude = c.spawnPosition.y;
		this.controller = new HelicopterController({
			maxSpeed: c.baseSpeed,
			rollYawMultiplier: this._rollYawMultiplier,
			smoothingAlpha: this._lerpAlpha,
			...c.controller,
		});

		this.camera = new THREE.PerspectiveCamera(c.fov, 1, c.near, c.far);
		this.rig = new THREE.Group();
		this.rig.position.set(c.spawnPosition.x, c.spawnPosition.y, c.spawnPosition.z);
		this.rig.add(this.camera);
	}

	get baseSpeed(): number {
		return this._baseSpeed;
	}

	set baseSpeed(value: number) {
		this._baseSpeed = value;
		this.controller.setConfig({ maxSpeed: value });
	}

	get rollYawMultiplier(): number {
		return this._rollYawMultiplier;
	}

	set rollYawMultiplier(value: number) {
		this._rollYawMultiplier = value;
		this.controller.setConfig({ rollYawMultiplier: value });
	}

	get lerpAlpha(): number {
		return this._lerpAlpha;
	}

	set lerpAlpha(value: number) {
		this._lerpAlpha = value;
		this.controller.setConfig({ smoothingAlpha: value });
	}

	updateOrientation(data: OrientationData): void {
		this.controller.updateOrientation(data);
	}

	updateSpeed(_cmd: SpeedCommand): void {}

	updateLiftInput(value: number): void {
		this.controller.updateLiftInput(value);
	}

	tick(delta: number): void {
		const step = this.controller.tick(delta);
		if (!Number.isFinite(delta) || delta <= 0) {
			this.velocity = step.speed;
			return;
		}

		const forwardDistance = step.forwardDistance * delta;
		this.rig.position.x += -Math.sin(step.heading) * forwardDistance;
		this.rig.position.z += -Math.cos(step.heading) * forwardDistance;
		this.heldAltitude += step.verticalDelta * delta;
		this.rig.position.y = this.heldAltitude;
		this.rig.rotation.set(-step.pitchRadians, step.heading, -step.rollRadians, "YXZ");
		this.velocity = step.speed;
		this.clampToTerrain();
	}

	dispose(): void {
		this.controller.dispose();
	}

	private clampToTerrain(): void {
		const terrainY = getHeight(
			this.rig.position.x,
			this.rig.position.z,
			DEFAULT_HEIGHTMAP,
		);
		const minY = terrainY + this.minClearance;
		if (this.rig.position.y >= minY) return;
		this.rig.position.y = minY;
		this.heldAltitude = minY;
		this.controller.scaleSpeed(this.terrainSlowdown);
		this.velocity *= this.terrainSlowdown;
	}
}
