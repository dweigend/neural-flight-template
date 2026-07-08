<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type * as Three from "three";
	import type { ActiveExperience } from "$lib/experiences/loader";
	import type {
		ExperienceState,
		PlayerOrientationInput,
	} from "$lib/experiences/types";
	import { getActiveExperienceId } from "$lib/experiences/loader";
	import { createWebSocketClient } from "$lib/ws/client.svelte";
	import {
		isOrientationData,
		isSettingsUpdate,
		isSpeedCommand,
	} from "$lib/ws/protocol";

	type ThreeModule = typeof import("three");

	interface StateWithPlayer {
		player?: unknown;
		camera?: unknown;
	}

	interface PlayerWithRig {
		rig: Three.Object3D;
	}

	const ICAROS_MODEL_URL = "/models/icaros.glb";
	const ICAROS_MODEL_SCALE = 2.5;
	const CAMERA_DISTANCE = 12;
	const CAMERA_HEIGHT = 5;
	const CAMERA_LOOK_AHEAD = 7;
	const CAMERA_SMOOTHING = 0.12;

	let canvas: HTMLCanvasElement;
	let renderer: Three.WebGLRenderer | null = null;
	let scene: Three.Scene | null = null;
	let spectatorCamera: Three.PerspectiveCamera | null = null;
	let experience: ActiveExperience | null = null;
	let playerModel: Three.Group | null = null;
	let removeResizeListener: (() => void) | null = null;
	let lastProcessedTimestamp = 0;
	let lastOrientation: PlayerOrientationInput = { pitch: 0, roll: 0 };
	let lastSpeed = { accelerate: false, brake: false };

	const clock = { value: null as Three.Clock | null };
	const ws = createWebSocketClient();

	onMount(() => {
		let disposed = false;

		async function start(): Promise<void> {
			const THREE = await import("three");
			const { loadExperience } = await import("$lib/experiences/loader");
			const { loadGLTF } = await import("$lib/three/loader");
			if (disposed) return;

			scene = new THREE.Scene();
			spectatorCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 10_000);
			const experienceCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 10_000);

			renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
			renderer.shadowMap.enabled = true;
			renderer.shadowMap.type = THREE.PCFSoftShadowMap;

			playerModel = await createPlayerModel(THREE, loadGLTF);
			scene.add(playerModel);

			experience = await loadExperience(getActiveExperienceId(), {
				scene,
				camera: experienceCamera,
				renderer,
			});
			if (disposed) return;

			clock.value = new THREE.Clock();
			const resize = (): void => resizeCameras(THREE);
			window.addEventListener("resize", resize);
			removeResizeListener = () => window.removeEventListener("resize", resize);
			resize();

			renderer.setAnimationLoop(() => tick(THREE));
		}

		start();

		return () => {
			disposed = true;
		};
	});

	onDestroy(async () => {
		removeResizeListener?.();
		renderer?.setAnimationLoop(null);
		if (scene) {
			const { unloadExperience } = await import("$lib/experiences/loader");
			unloadExperience(scene);
		}
		if (playerModel) disposeObject(playerModel);
		renderer?.dispose();
		ws.disconnect();
	});

	async function createPlayerModel(
		THREE: ThreeModule,
		loadGLTF: (url: string) => Promise<{ scene: Three.Group }>,
	): Promise<Three.Group> {
		const root = new THREE.Group();
		const gltf = await loadGLTF(ICAROS_MODEL_URL);
		gltf.scene.scale.setScalar(ICAROS_MODEL_SCALE);
		root.add(gltf.scene);
		return root;
	}

	function tick(THREE: ThreeModule): void {
		if (!renderer || !scene || !spectatorCamera || !experience || !clock.value) {
			return;
		}

		const delta = clock.value.getDelta();
		processControllerMessages();

		experience.manifest.updatePlayer(
			lastOrientation,
			lastSpeed,
			experience.state,
			delta,
		);

		const experienceCamera = getExperienceCamera(THREE, experience.state);
		const playerSource = getPlayerSource(THREE, experience.state);
		if (!experienceCamera || !playerSource) return;

		const result = experience.manifest.tick(experience.state, {
			delta,
			elapsed: clock.value.elapsedTime,
			camera: experienceCamera,
			playerPosition: playerSource.position,
			playerRotation: playerSource.rotation,
		});
		experience.state = result.state;

		updatePlayerModelAndCamera(THREE, experienceCamera, playerSource);
		renderer.render(scene, spectatorCamera);
	}

	function processControllerMessages(): void {
		const msg = ws.lastMessage;
		if (!msg || msg.timestamp <= lastProcessedTimestamp || !experience || !scene) {
			return;
		}
		lastProcessedTimestamp = msg.timestamp;

		if (isOrientationData(msg)) {
			lastOrientation = {
				pitch: msg.pitch,
				roll: msg.roll,
				...(msg.yaw !== undefined ? { yaw: msg.yaw } : {}),
				...(msg.rawPitch !== undefined ? { rawPitch: msg.rawPitch } : {}),
				...(msg.rawRoll !== undefined ? { rawRoll: msg.rawRoll } : {}),
			};
			return;
		}

		if (isSpeedCommand(msg)) {
			lastSpeed = {
				accelerate: msg.action === "accelerate" && msg.active,
				brake: msg.action === "brake" && msg.active,
			};
			return;
		}

		if (!isSettingsUpdate(msg)) return;
		for (const key of Object.keys(msg.settings)) {
			experience.manifest.applySettings(
				key,
				msg.settings[key] as number | boolean | string,
				experience.state,
				scene,
			);
		}
	}

	function updatePlayerModelAndCamera(
		THREE: ThreeModule,
		experienceCamera: Three.PerspectiveCamera,
		playerSource: Three.Object3D,
	): void {
		if (!playerModel || !spectatorCamera) return;

		const playerPosition = new THREE.Vector3();
		const playerQuaternion = new THREE.Quaternion();
		const forward = new THREE.Vector3();
		playerSource.getWorldPosition(playerPosition);
		experienceCamera.getWorldQuaternion(playerQuaternion);
		forward.set(0, 0, -1).applyQuaternion(playerQuaternion).normalize();

		playerModel.position.copy(playerPosition);
		playerModel.rotation.set(
			THREE.MathUtils.degToRad(-lastOrientation.roll),
			Math.atan2(-forward.x, -forward.z),
			THREE.MathUtils.degToRad(lastOrientation.pitch),
			"YXZ",
		);

		const targetCameraPosition = playerPosition
			.clone()
			.addScaledVector(forward, -CAMERA_DISTANCE);
		targetCameraPosition.y += CAMERA_HEIGHT;
		spectatorCamera.position.lerp(targetCameraPosition, CAMERA_SMOOTHING);
		spectatorCamera.lookAt(
			playerPosition.clone().addScaledVector(forward, CAMERA_LOOK_AHEAD),
		);
	}

	function resizeCameras(THREE: ThreeModule): void {
		if (!renderer || !spectatorCamera) return;

		const width = window.innerWidth;
		const height = window.innerHeight;
		const aspect = width / height;
		renderer.setSize(width, height);
		updateCameraAspect(spectatorCamera, aspect);

		const experienceCamera = experience
			? getExperienceCamera(THREE, experience.state)
			: null;
		if (experienceCamera) updateCameraAspect(experienceCamera, aspect);
	}

	function updateCameraAspect(
		camera: Three.PerspectiveCamera,
		aspect: number,
	): void {
		camera.aspect = aspect;
		camera.updateProjectionMatrix();
	}

	function getPlayerSource(
		THREE: ThreeModule,
		state: ExperienceState,
	): Three.Object3D | null {
		const s = state as StateWithPlayer;
		if (hasPlayerRig(THREE, s.player)) return s.player.rig;
		if (isPerspectiveCamera(THREE, s.camera)) return s.camera.parent ?? s.camera;
		return null;
	}

	function getExperienceCamera(
		THREE: ThreeModule,
		state: ExperienceState,
	): Three.PerspectiveCamera | null {
		const s = state as StateWithPlayer;
		return isPerspectiveCamera(THREE, s.camera) ? s.camera : null;
	}

	function hasPlayerRig(
		THREE: ThreeModule,
		value: unknown,
	): value is PlayerWithRig {
		if (typeof value !== "object" || value === null || !("rig" in value)) {
			return false;
		}
		return isObject3D(THREE, value.rig);
	}

	function isPerspectiveCamera(
		THREE: ThreeModule,
		value: unknown,
	): value is Three.PerspectiveCamera {
		return value instanceof THREE.PerspectiveCamera;
	}

	function isObject3D(
		THREE: ThreeModule,
		value: unknown,
	): value is Three.Object3D {
		return value instanceof THREE.Object3D;
	}

	function disposeObject(object: Three.Object3D): void {
		object.traverse((child) => {
			if (!(child instanceof Object) || !("geometry" in child)) return;
			const mesh = child as Three.Mesh;
			mesh.geometry?.dispose();
			const materials = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];
			for (const material of materials) material?.dispose();
		});
	}
</script>

<canvas bind:this={canvas} class="vr-canvas"></canvas>
