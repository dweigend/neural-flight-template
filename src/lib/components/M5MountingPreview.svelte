<script lang="ts">
import { onDestroy, onMount } from "svelte";

type ThreeModule = typeof import("three");
type ThreeGroup = import("three").Group;
type ThreeMesh = import("three").Mesh;
type ThreePerspectiveCamera = import("three").PerspectiveCamera;
type ThreeScene = import("three").Scene;
type ThreeWebGLRenderer = import("three").WebGLRenderer;

interface Props {
	pitchUsesRoll: boolean;
	rollUsesPitch: boolean;
	invertPitch: boolean;
	invertRoll: boolean;
}

let { pitchUsesRoll, rollUsesPitch, invertPitch, invertRoll }: Props = $props();

let container: HTMLDivElement | undefined = $state();
let canvas: HTMLCanvasElement | undefined = $state();
let threeModule: ThreeModule | null = null;
let scene: ThreeScene | null = null;
let camera: ThreePerspectiveCamera | null = null;
let renderer: ThreeWebGLRenderer | null = null;
let stickModel: ThreeGroup | null = null;
let resizeObserver: ResizeObserver | null = null;

const pitchSource = $derived(pitchUsesRoll ? "M5 roll" : "M5 pitch");
const rollSource = $derived(rollUsesPitch ? "M5 pitch" : "M5 roll");

$effect(() => {
	applyMountingPose();
});

onMount(() => {
	let cancelled = false;

	async function setup(): Promise<void> {
		if (!canvas || !container) return;
		const module = await import("three");
		if (cancelled) return;

		threeModule = module;
		scene = new module.Scene();
		scene.background = new module.Color(0x101418);

		camera = new module.PerspectiveCamera(42, 1, 0.1, 100);
		camera.position.set(0, 2.2, 5.6);
		camera.lookAt(0, 0, 0);

		renderer = new module.WebGLRenderer({ canvas, antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		scene.add(new module.AmbientLight(0xffffff, 1.7));

		const keyLight = new module.DirectionalLight(0xffffff, 2.2);
		keyLight.position.set(2.5, 4, 3);
		scene.add(keyLight);

		const fillLight = new module.DirectionalLight(0x8fd7ff, 1.2);
		fillLight.position.set(-3, 1.6, -2);
		scene.add(fillLight);

		scene.add(createIcarosReference(module));
		stickModel = createStickModel(module);
		scene.add(stickModel);
		applyMountingPose();

		resizeObserver = new ResizeObserver(([entry]) => {
			if (!renderer || !camera) return;
			const width = Math.max(1, Math.round(entry.contentRect.width));
			const height = Math.max(1, Math.round(entry.contentRect.height));
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		});
		resizeObserver.observe(container);

		renderer.setAnimationLoop(() => {
			if (!renderer || !scene || !camera) return;
			renderer.render(scene, camera);
		});
	}

	void setup();

	return () => {
		cancelled = true;
		cleanupScene();
	};
});

onDestroy(cleanupScene);

function applyMountingPose(): void {
	if (!stickModel) return;

	const swapAxes = pitchUsesRoll || rollUsesPitch;
	const zRotation = swapAxes ? Math.PI / 2 : 0;
	const xRotation = invertPitch ? Math.PI : 0;
	const yRotation = invertRoll ? Math.PI : 0;

	stickModel.rotation.set(-0.22 + xRotation, yRotation, zRotation);
}

function createIcarosReference(module: ThreeModule): ThreeGroup {
	const group = new module.Group();

	const railMaterial = new module.MeshStandardMaterial({
		color: 0x26313a,
		roughness: 0.62,
	});
	const pitchMaterial = new module.MeshStandardMaterial({
		color: 0x36d399,
		roughness: 0.45,
	});
	const rollMaterial = new module.MeshStandardMaterial({
		color: 0x60a5fa,
		roughness: 0.45,
	});

	const baseRail = new module.Mesh(new module.BoxGeometry(2.7, 0.08, 0.08), railMaterial);
	baseRail.position.set(0, -1.35, -0.18);
	group.add(baseRail);

	const pitchAxis = new module.Mesh(
		new module.BoxGeometry(0.08, 2.8, 0.08),
		pitchMaterial,
	);
	pitchAxis.position.set(-1.55, 0, -0.18);
	group.add(pitchAxis);

	const rollAxis = new module.Mesh(
		new module.BoxGeometry(2.8, 0.08, 0.08),
		rollMaterial,
	);
	rollAxis.position.set(0, -1.58, -0.18);
	group.add(rollAxis);

	const pitchTip = new module.Mesh(new module.BoxGeometry(0.22, 0.22, 0.12), pitchMaterial);
	pitchTip.position.set(-1.55, 1.45, -0.18);
	group.add(pitchTip);

	const rollTip = new module.Mesh(new module.BoxGeometry(0.22, 0.22, 0.12), rollMaterial);
	rollTip.position.set(1.45, -1.58, -0.18);
	group.add(rollTip);

	return group;
}

function createStickModel(module: ThreeModule): ThreeGroup {
	const group = new module.Group();

	const body = new module.Mesh(
		new module.BoxGeometry(1.25, 2.4, 0.34),
		new module.MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.56, metalness: 0.08 }),
	);
	group.add(body);

	const screen = new module.Mesh(
		new module.BoxGeometry(0.88, 0.72, 0.04),
		new module.MeshStandardMaterial({ color: 0x182b35, emissive: 0x0c2935, roughness: 0.34 }),
	);
	screen.position.set(0, 0.44, 0.2);
	group.add(screen);

	const accent = new module.Mesh(
		new module.BoxGeometry(0.72, 0.16, 0.05),
		new module.MeshStandardMaterial({ color: 0xff5d2d, roughness: 0.42 }),
	);
	accent.position.set(0, -0.22, 0.22);
	group.add(accent);

	const button = new module.Mesh(
		new module.BoxGeometry(0.34, 0.2, 0.08),
		new module.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.48 }),
	);
	button.position.set(0, -0.72, 0.24);
	group.add(button);

	const sideButton = new module.Mesh(
		new module.BoxGeometry(0.08, 0.5, 0.18),
		new module.MeshStandardMaterial({ color: 0xffc857, roughness: 0.42 }),
	);
	sideButton.position.set(0.68, -0.12, 0.04);
	group.add(sideButton);

	return group;
}

function cleanupScene(): void {
	resizeObserver?.disconnect();
	resizeObserver = null;
	renderer?.setAnimationLoop(null);
	if (scene && stickModel) {
		scene.remove(stickModel);
	}
	disposeGroup(stickModel);
	renderer?.dispose();
	stickModel = null;
	renderer = null;
	scene = null;
	camera = null;
	threeModule = null;
}

function disposeGroup(group: ThreeGroup | null): void {
	if (!group || !threeModule) return;

	group.traverse((object) => {
		if (!threeModule || !(object instanceof threeModule.Mesh)) return;
		const mesh = object as ThreeMesh;
		mesh.geometry.dispose();

		if (Array.isArray(mesh.material)) {
			for (const material of mesh.material) {
				material.dispose();
			}
			return;
		}

		mesh.material.dispose();
	});
}
</script>

<div class="mounting-preview">
	<div class="mounting-canvas" bind:this={container}>
		<canvas bind:this={canvas}></canvas>
	</div>
	<div class="mounting-legend">
		<span>Pitch: {pitchSource}</span>
		<span>Roll: {rollSource}</span>
		<span class:muted={!invertPitch}>Pitch {invertPitch ? "inverted" : "normal"}</span>
		<span class:muted={!invertRoll}>Roll {invertRoll ? "inverted" : "normal"}</span>
	</div>
</div>

<style>
.mounting-preview {
	display: grid;
	grid-template-columns: minmax(180px, 1fr) minmax(0, 1fr);
	gap: 1rem;
	align-items: stretch;
}

.mounting-canvas {
	min-height: 180px;
	border: 1px solid var(--border);
	background: #101418;
}

.mounting-canvas canvas {
	display: block;
	width: 100%;
	height: 100%;
}

.mounting-legend {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 0.45rem;
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--text-muted);
	text-transform: uppercase;
}

.mounting-legend span {
	border: 1px solid var(--border);
	padding: 0.45rem;
}

.mounting-legend .muted {
	opacity: 0.58;
}

@media (max-width: 720px) {
	.mounting-preview {
		grid-template-columns: 1fr;
	}
}
</style>
