<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { getChunkKey } from "$lib/experiences/visio-technologica/chunk-core";
	import {
		VISIO_TILE_CHUNK_MANIFEST,
		type VisioTileChunkManifestEntry,
	} from "$lib/experiences/visio-technologica/chunking";
	import {
		createChunkViewHorizon,
		type ChunkViewHorizon,
		type WorldDirection,
	} from "$lib/experiences/visio-technologica/chunk-horizon";
	import VisioTileChunkManifestDebugPanel, {
		type VisioTileChunkManifestEntryView,
		type VisioTileChunkManifestStatus,
	} from "./VisioTileChunkManifestDebugPanel.svelte";
	import {
		createVisioChunkFlightInput,
		isVisioChunkFlightCode,
	} from "./visioChunkHorizonFlightControls";

	type ThreeLineBasicMaterial = import("three").LineBasicMaterial;
	type ThreeMeshBasicMaterial = import("three").MeshBasicMaterial;
	type ThreeModule = typeof import("three");
	type ThreeGroup = import("three").Group;
	type ThreePerspectiveCamera = import("three").PerspectiveCamera;
	type ThreeScene = import("three").Scene;
	type ThreeVector3 = import("three").Vector3;
	type ThreeWebGLRenderer = import("three").WebGLRenderer;

	type ProxyVisual = Readonly<{
		entry: VisioTileChunkManifestEntry;
		fillMaterial: ThreeMeshBasicMaterial;
		wireMaterial: ThreeLineBasicMaterial;
	}>;

	const MANIFEST = VISIO_TILE_CHUNK_MANIFEST;
	const MANIFEST_ENTRIES = MANIFEST.entries;
	const INITIAL_CAMERA_POSITION = {
		x: 8,
		y: 8,
		z: 20,
	} as const;
	const INITIAL_PITCH_RADIANS = -0.28;
	const INITIAL_YAW_RADIANS = Math.PI;
	const MAX_FRAME_DELTA_SECONDS = 0.08;
	const MAX_PITCH_RADIANS = Math.PI / 2 - 0.02;
	const LOOK_SENSITIVITY = 0.0022;
	const MOVE_SPEED = 7;
	const VIEW_DISTANCE = 8;
	const EDGE_BUFFER_RADIANS = Math.PI / 10;
	const FADE_START_RATIO = 0.7;
	const BACKGROUND_COLOR = 0x050912;
	const BASE_STARTER_COLOR = 0xf59e0b;
	const BASE_DEFERRED_COLOR = 0x475569;
	const HIGHLIGHT_COLOR = 0x67e8f9;

	const pressedKeys = new Set<string>();
	let activeHorizonSignature = "";
	let canvas: HTMLCanvasElement | undefined = $state();
	let container: HTMLDivElement | undefined = $state();
	let camera: ThreePerspectiveCamera | null = null;
	let pitchRadians = INITIAL_PITCH_RADIANS;
	let pointerLockElement = $state<Element | null>(null);
	let previousFrameTimeMilliseconds: number | undefined;
	let proxyGroup: ThreeGroup | null = null;
	let proxyVisuals: readonly ProxyVisual[] = [];
	let renderer: ThreeWebGLRenderer | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let scene: ThreeScene | null = null;
	let status = $state<VisioTileChunkManifestStatus>({
		observerChunkKey: "0:0:0",
		pointerLockLabel: "Click View",
		positionLabel: "0, 0, 0",
		selectedChunkKeys: [],
		visibleChunkCount: 0,
		visibleTileIds: [],
	});
	let threeModule: ThreeModule | null = null;
	let yawRadians = INITIAL_YAW_RADIANS;

	const manifestEntryViews = $derived(
		MANIFEST_ENTRIES.map<VisioTileChunkManifestEntryView>((entry) => ({
			chunkKey: entry.chunkKey,
			fileName: entry.fileName,
			id: entry.id,
			isVisible: status.visibleTileIds.includes(entry.id),
		})),
	);

	onMount(() => {
		let cancelled = false;

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("keyup", handleKeyUp);
		document.addEventListener("pointerlockchange", handlePointerLockChange);
		document.addEventListener("mousemove", handlePointerLockMouseMove);

		async function setup(): Promise<void> {
			if (!canvas || !container) {
				return;
			}

			const module = await import("three");
			if (cancelled) {
				return;
			}

			threeModule = module;
			scene = new module.Scene();
			scene.background = new module.Color(BACKGROUND_COLOR);

			camera = new module.PerspectiveCamera(64, 1, 0.1, 200);
			renderer = new module.WebGLRenderer({
				alpha: false,
				antialias: true,
				canvas,
			});
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

			scene.add(new module.AmbientLight(0xffffff, 1));
			const light = new module.DirectionalLight(0xffffff, 1.9);
			light.position.set(10, 16, 8);
			scene.add(light);
			scene.add(createReferenceGrid(module));
			scene.add(createAxisTripod(module));

			const createdProxyVisuals = createProxyVisuals(module, MANIFEST_ENTRIES);
			proxyVisuals = createdProxyVisuals.visuals;
			proxyGroup = createdProxyVisuals.group;
			scene.add(proxyGroup);

			resetCamera();
			updateVisibleManifestState();

			resizeObserver = new ResizeObserver(([entry]) => {
				if (!renderer || !camera) {
					return;
				}

				const width = Math.max(1, Math.round(entry.contentRect.width));
				const height = Math.max(1, Math.round(entry.contentRect.height));
				renderer.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			});
			resizeObserver.observe(container);

			renderer.setAnimationLoop((frameTimeMilliseconds) => {
				renderFrame(frameTimeMilliseconds);
			});
		}

		void setup();

		return () => {
			cancelled = true;
			cleanupScene();
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("keyup", handleKeyUp);
			document.removeEventListener("pointerlockchange", handlePointerLockChange);
			document.removeEventListener("mousemove", handlePointerLockMouseMove);
			pressedKeys.clear();
		};
	});

	onDestroy(cleanupScene);

	function renderFrame(frameTimeMilliseconds = performance.now()): void {
		if (!renderer || !scene || !camera) {
			return;
		}

		const deltaSeconds = getFrameDeltaSeconds(frameTimeMilliseconds);
		updateCameraFlight(deltaSeconds);
		updateVisibleManifestState();
		renderer.render(scene, camera);
	}

	function getFrameDeltaSeconds(frameTimeMilliseconds: number): number {
		if (previousFrameTimeMilliseconds === undefined) {
			previousFrameTimeMilliseconds = frameTimeMilliseconds;
			return 0;
		}

		const deltaSeconds = Math.min(
			MAX_FRAME_DELTA_SECONDS,
			(frameTimeMilliseconds - previousFrameTimeMilliseconds) / 1000,
		);
		previousFrameTimeMilliseconds = frameTimeMilliseconds;
		return deltaSeconds;
	}

	function resetCamera(): void {
		if (!camera) {
			return;
		}

		yawRadians = INITIAL_YAW_RADIANS;
		pitchRadians = INITIAL_PITCH_RADIANS;
		camera.position.set(
			INITIAL_CAMERA_POSITION.x,
			INITIAL_CAMERA_POSITION.y,
			INITIAL_CAMERA_POSITION.z,
		);
		applyCameraRotation();
	}

	function updateCameraFlight(deltaSeconds: number): void {
		if (!camera || deltaSeconds <= 0) {
			return;
		}

		const input = createVisioChunkFlightInput(pressedKeys);
		const forwardVector = newVector3();
		const rightVector = newVector3();
		const movementVector = newVector3();

		camera.getWorldDirection(forwardVector);
		camera.updateMatrixWorld();
		rightVector.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
		movementVector.addScaledVector(forwardVector, input.forward);
		movementVector.addScaledVector(rightVector, input.strafe);
		movementVector.y += input.vertical;

		if (movementVector.lengthSq() > 1) {
			movementVector.normalize();
		}

		camera.position.addScaledVector(movementVector, MOVE_SPEED * deltaSeconds);
		camera.updateMatrixWorld();
	}

	function updateVisibleManifestState(): void {
		if (!camera) {
			return;
		}

		const horizon = createCurrentHorizon(camera);
		updateStatusFromHorizon(horizon);
		if (horizon.signature === activeHorizonSignature) {
			return;
		}

		applyProxyHighlightState(horizon);
		activeHorizonSignature = horizon.signature;
	}

	function createCurrentHorizon(currentCamera: ThreePerspectiveCamera): ChunkViewHorizon {
		currentCamera.updateMatrixWorld();
		const forwardWorldDirection = newVector3();
		const rightWorldDirection = newVector3();
		const upWorldDirection = newVector3();
		currentCamera.getWorldDirection(forwardWorldDirection);
		rightWorldDirection.setFromMatrixColumn(currentCamera.matrixWorld, 0).normalize();
		upWorldDirection.setFromMatrixColumn(currentCamera.matrixWorld, 1).normalize();

		return createChunkViewHorizon({
			dimensions: MANIFEST.chunkDimensions,
			edgeBufferRadians: EDGE_BUFFER_RADIANS,
			fadeStartRatio: FADE_START_RATIO,
			forwardWorldDirection: toWorldDirection(forwardWorldDirection),
			observerWorldPosition: {
				x: currentCamera.position.x,
				y: currentCamera.position.y,
				z: currentCamera.position.z,
			},
			rightWorldDirection: toWorldDirection(rightWorldDirection),
			upWorldDirection: toWorldDirection(upWorldDirection),
			verticalFovRadians: (currentCamera.fov * Math.PI) / 180,
			viewportAspect: currentCamera.aspect,
			viewDistance: VIEW_DISTANCE,
		});
	}

	function updateStatusFromHorizon(horizon: ChunkViewHorizon): void {
		const visibleChunkKeys = new Set(horizon.bounds.map((bounds) => bounds.key));
		const visibleTileIds = MANIFEST_ENTRIES.filter((entry) => visibleChunkKeys.has(entry.chunkKey)).map(
			(entry) => entry.id,
		);

		status = {
			observerChunkKey: getChunkKey(horizon.currentChunkCoordinate),
			pointerLockLabel:
				pointerLockElement === canvas ? "Mouse Look Active" : "Click View",
			positionLabel: camera
				? `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`
				: "0, 0, 0",
			selectedChunkKeys: horizon.bounds.map((bounds) => bounds.key),
			visibleChunkCount: horizon.bounds.length,
			visibleTileIds,
		};
	}

	function createProxyVisuals(
		module: ThreeModule,
		entries: readonly VisioTileChunkManifestEntry[],
	): Readonly<{ group: ThreeGroup; visuals: readonly ProxyVisual[] }> {
		const group = new module.Group();
		const visuals: ProxyVisual[] = [];

		for (const entry of entries) {
			const fillMaterial = new module.MeshBasicMaterial({
				color: entry.isStarter ? BASE_STARTER_COLOR : BASE_DEFERRED_COLOR,
				opacity: 0.4,
				transparent: true,
			});
			const wireMaterial = new module.LineBasicMaterial({
				color: entry.isStarter ? BASE_STARTER_COLOR : BASE_DEFERRED_COLOR,
				transparent: true,
				opacity: 0.85,
			});
			const boxGeometry = new module.BoxGeometry(0.84, 0.2, 0.84);
			const edgeGeometry = new module.EdgesGeometry(boxGeometry);
			const fillMesh = new module.Mesh(boxGeometry, fillMaterial);
			const edgeLines = new module.LineSegments(edgeGeometry, wireMaterial);
			const worldCenterY = entry.worldCenter.y;
			fillMesh.position.set(entry.worldCenter.x, worldCenterY, entry.worldCenter.z);
			edgeLines.position.set(entry.worldCenter.x, worldCenterY, entry.worldCenter.z);
			group.add(fillMesh);
			group.add(edgeLines);
			visuals.push({
				entry,
				fillMaterial,
				wireMaterial,
			});
		}

		return { group, visuals };
	}

	function applyProxyHighlightState(horizon: ChunkViewHorizon): void {
		const visibleChunkKeys = new Set(horizon.bounds.map((bounds) => bounds.key));

		for (const proxyVisual of proxyVisuals) {
			const visibleBounds = horizon.bounds.find((bounds) => bounds.key === proxyVisual.entry.chunkKey);
			const isVisible = visibleChunkKeys.has(proxyVisual.entry.chunkKey);
			const targetColor = isVisible
				? HIGHLIGHT_COLOR
				: proxyVisual.entry.isStarter
					? BASE_STARTER_COLOR
					: BASE_DEFERRED_COLOR;
			const fadeProgress = visibleBounds?.fadeProgress ?? 1;
			proxyVisual.fillMaterial.color.setHex(targetColor);
			proxyVisual.fillMaterial.opacity = isVisible
				? 0.22 + (1 - fadeProgress) * 0.28
				: 0.14;
			proxyVisual.wireMaterial.color.setHex(targetColor);
			proxyVisual.wireMaterial.opacity = isVisible ? 1 - fadeProgress * 0.35 : 0.45;
		}
	}

	function createReferenceGrid(module: ThreeModule): ThreeGroup {
		const group = new module.Group();
		const gridHelper = new module.GridHelper(24, 24, 0x334155, 0x172033);
		group.add(gridHelper);
		return group;
	}

	function createAxisTripod(module: ThreeModule): ThreeGroup {
		const group = new module.Group();
		group.add(createAxisLine(module, { x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, 0xfb7185));
		group.add(createAxisLine(module, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0x4ade80));
		group.add(createAxisLine(module, { x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 2 }, 0x60a5fa));
		return group;
	}

	function createAxisLine(
		module: ThreeModule,
		start: Readonly<{ x: number; y: number; z: number }>,
		end: Readonly<{ x: number; y: number; z: number }>,
		color: number,
	): import("three").LineSegments {
		const geometry = new module.BufferGeometry().setFromPoints([
			new module.Vector3(start.x, start.y, start.z),
			new module.Vector3(end.x, end.y, end.z),
		]);
		const material = new module.LineBasicMaterial({ color });
		return new module.LineSegments(geometry, material);
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (!isVisioChunkFlightCode(event.code)) {
			return;
		}

		event.preventDefault();
		pressedKeys.add(event.code);
	}

	function handleKeyUp(event: KeyboardEvent): void {
		if (!isVisioChunkFlightCode(event.code)) {
			return;
		}

		event.preventDefault();
		pressedKeys.delete(event.code);
	}

	function handlePointerLockChange(): void {
		pointerLockElement = document.pointerLockElement;
	}

	function handlePointerLockMouseMove(event: MouseEvent): void {
		if (pointerLockElement !== canvas) {
			return;
		}

		yawRadians -= event.movementX * LOOK_SENSITIVITY;
		pitchRadians -= event.movementY * LOOK_SENSITIVITY;
		pitchRadians = Math.max(
			-MAX_PITCH_RADIANS,
			Math.min(MAX_PITCH_RADIANS, pitchRadians),
		);
		applyCameraRotation();
	}

	function applyCameraRotation(): void {
		if (!camera) {
			return;
		}

		camera.rotation.order = "YXZ";
		camera.rotation.y = yawRadians;
		camera.rotation.x = pitchRadians;
		camera.rotation.z = 0;
		camera.updateMatrixWorld();
	}

	function requestPointerLock(): void {
		canvas?.requestPointerLock();
	}

	function cleanupScene(): void {
		resizeObserver?.disconnect();
		resizeObserver = null;
		renderer?.setAnimationLoop(null);
		disposeSceneNode(proxyGroup);
		renderer?.dispose();
		proxyGroup = null;
		proxyVisuals = [];
		renderer = null;
		camera = null;
		scene = null;
		threeModule = null;
		previousFrameTimeMilliseconds = undefined;
		activeHorizonSignature = "";
	}

	function disposeSceneNode(node: ThreeGroup | null): void {
		const module = threeModule;
		if (!node || !module) {
			return;
		}

		node.traverse((object) => {
			if (object instanceof module.Mesh) {
				object.geometry.dispose();
				disposeMaterial(object.material);
				return;
			}

			if (object instanceof module.LineSegments) {
				object.geometry.dispose();
				disposeMaterial(object.material);
			}
		});
	}

	function disposeMaterial(
		material: import("three").Material | import("three").Material[],
	): void {
		if (Array.isArray(material)) {
			for (const entry of material) {
				entry.dispose();
			}
			return;
		}

		material.dispose();
	}

	function toWorldDirection(vector: ThreeVector3): WorldDirection {
		return {
			x: vector.x,
			y: vector.y,
			z: vector.z,
		};
	}

	function newVector3(): ThreeVector3 {
		if (!threeModule) {
			throw new Error("Three.js module must be loaded before creating vectors.");
		}

		return new threeModule.Vector3();
	}
</script>

<svelte:head>
	<title>Visio Tile Chunk Manifest Lab</title>
</svelte:head>

<div class="page-shell">
	<div class="page-content">
		<div class="viewport-card">
			<div class="viewport" bind:this={container}>
				<canvas
					bind:this={canvas}
					aria-label="Visio tile chunk manifest debug viewport"
					onclick={requestPointerLock}
				></canvas>
			</div>
		</div>

		<VisioTileChunkManifestDebugPanel entries={manifestEntryViews} {status} />
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.page-shell {
		min-height: 100vh;
		padding: 2rem 1rem 3rem;
		background: #020617;
		color: #e2e8f0;
	}

	.page-content {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 1rem;
		align-items: start;
	}

	.viewport-card {
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 1rem;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.82);
		box-shadow: 0 18px 60px rgba(2, 6, 23, 0.38);
	}

	.viewport {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: min(62vh, 680px);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}

	:global(.debug-panel) {
		max-height: min(62vh, 680px);
		border-radius: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	@media (max-width: 960px) {
		.page-content {
			grid-template-columns: 1fr;
		}

		.viewport {
			max-height: min(52vh, 480px);
		}

		:global(.debug-panel) {
			max-height: none;
		}
	}
</style>
