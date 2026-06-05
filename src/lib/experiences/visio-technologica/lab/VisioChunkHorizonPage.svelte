<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import {
        createChunkViewHorizon,
        type ChunkViewHorizon,
        type ChunkViewHorizonBounds,
        type WorldDirection,
    } from "$lib/experiences/visio-technologica/chunk-horizon";
    import { getChunkKey } from "$lib/experiences/visio-technologica/chunk-core";
    import VisioChunkHorizonDebugPanel, {
        type VisioChunkHorizonStatus,
    } from "./VisioChunkHorizonDebugPanel.svelte";
    import {
        createVisioChunkFlightInput,
        isVisioChunkFlightCode,
    } from "./visioChunkHorizonFlightControls";
    import {
        VISIO_HORIZON_BACKGROUND_COLOR,
        VISIO_HORIZON_CHUNK_DIMENSIONS,
        VISIO_HORIZON_EDGE_BUFFER_RADIANS,
        VISIO_HORIZON_FADE_START_RATIO,
        VISIO_HORIZON_FAR_COLOR,
        VISIO_HORIZON_GRID_EXTENT,
        VISIO_HORIZON_INITIAL_CAMERA_POSITION,
        VISIO_HORIZON_INITIAL_PITCH_RADIANS,
        VISIO_HORIZON_INITIAL_YAW_RADIANS,
        VISIO_HORIZON_LOOK_SENSITIVITY,
        VISIO_HORIZON_MAX_FRAME_DELTA_SECONDS,
        VISIO_HORIZON_MAX_PITCH_RADIANS,
        VISIO_HORIZON_MOVE_SPEED,
        VISIO_HORIZON_NEAR_COLOR,
        VISIO_HORIZON_VIEW_DISTANCE,
    } from "./visioChunkHorizonConfig";

    type ThreeModule = typeof import("three");
    type ThreeColorRepresentation = import("three").ColorRepresentation;
    type ThreeGroup = import("three").Group;
    type ThreePerspectiveCamera = import("three").PerspectiveCamera;
    type ThreeScene = import("three").Scene;
    type ThreeVector3 = import("three").Vector3;
    type ThreeWebGLRenderer = import("three").WebGLRenderer;

    const DIRECTION_BY_AXIS_SIGN = {
        x: { negative: "West", positive: "East" },
        y: { negative: "Down", positive: "Up" },
        z: { negative: "North", positive: "South" },
    } as const;

    type DirectionAxis = keyof typeof DIRECTION_BY_AXIS_SIGN;
    type DirectionSign = keyof (typeof DIRECTION_BY_AXIS_SIGN)["x"];
    type DirectionLabel =
        (typeof DIRECTION_BY_AXIS_SIGN)[DirectionAxis][DirectionSign];

    const pressedKeys = new Set<string>();
    let activeVisualSignature = "";
    let canvas: HTMLCanvasElement | undefined = $state();
    let container: HTMLDivElement | undefined = $state();
    let camera: ThreePerspectiveCamera | null = null;
    let chunkVisualGroup: ThreeGroup | null = null;
    let pitchRadians = VISIO_HORIZON_INITIAL_PITCH_RADIANS;
    let pointerLockElement = $state<Element | null>(null);
    let previousFrameTimeMilliseconds: number | undefined;
    let renderer: ThreeWebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let scene: ThreeScene | null = null;
    let status = $state<VisioChunkHorizonStatus>({
        activeChunkCount: 0,
        chunkKeys: [],
        directionLabel: "North",
        observerChunkKey: "0:0:0",
        pointerLockLabel: "Click View",
        positionLabel: "0, 0, 0",
    });
    let threeModule: ThreeModule | null = null;
    let yawRadians = VISIO_HORIZON_INITIAL_YAW_RADIANS;

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
            scene.background = new module.Color(VISIO_HORIZON_BACKGROUND_COLOR);

            camera = new module.PerspectiveCamera(64, 1, 0.1, 900);
            renderer = new module.WebGLRenderer({
                alpha: false,
                antialias: true,
                canvas,
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            scene.add(new module.AmbientLight(0xffffff, 0.9));
            const light = new module.DirectionalLight(0xffffff, 1.8);
            light.position.set(8, 16, 10);
            scene.add(light);
            scene.add(createReferenceGrid(module));
            scene.add(createAxisTripod(module));
            scene.add(createObserverMarker(module));

            resetCamera();
            updateChunkVisual();

            resizeObserver = new ResizeObserver(([entry]) => {
                if (!renderer || !camera) {
                    return;
                }

                const width = Math.max(1, Math.round(entry.contentRect.width));
                const height = Math.max(
                    1,
                    Math.round(entry.contentRect.height),
                );
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            });
            resizeObserver.observe(container);

            renderer.setAnimationLoop((frameTimeMilliseconds) => {
                renderDemoFrame(frameTimeMilliseconds);
            });
        }

        void setup();

        return () => {
            cancelled = true;
            cleanupScene();
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
            document.removeEventListener(
                "pointerlockchange",
                handlePointerLockChange,
            );
            document.removeEventListener(
                "mousemove",
                handlePointerLockMouseMove,
            );
            pressedKeys.clear();
        };
    });

    onDestroy(cleanupScene);

    function renderDemoFrame(frameTimeMilliseconds = performance.now()): void {
        if (!renderer || !scene || !camera) {
            return;
        }

        const deltaSeconds = getFrameDeltaSeconds(frameTimeMilliseconds);
        updateCameraFlight(deltaSeconds);
        updateChunkVisual();
        renderer.render(scene, camera);
    }

    function getFrameDeltaSeconds(frameTimeMilliseconds: number): number {
        if (previousFrameTimeMilliseconds === undefined) {
            previousFrameTimeMilliseconds = frameTimeMilliseconds;
            return 0;
        }

        const deltaSeconds = Math.min(
            VISIO_HORIZON_MAX_FRAME_DELTA_SECONDS,
            (frameTimeMilliseconds - previousFrameTimeMilliseconds) / 1000,
        );
        previousFrameTimeMilliseconds = frameTimeMilliseconds;
        return deltaSeconds;
    }

    function resetCamera(): void {
        if (!camera) {
            return;
        }

        yawRadians = VISIO_HORIZON_INITIAL_YAW_RADIANS;
        pitchRadians = VISIO_HORIZON_INITIAL_PITCH_RADIANS;
        camera.position.set(
            VISIO_HORIZON_INITIAL_CAMERA_POSITION.x,
            VISIO_HORIZON_INITIAL_CAMERA_POSITION.y,
            VISIO_HORIZON_INITIAL_CAMERA_POSITION.z,
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

        camera.position.addScaledVector(
            movementVector,
            VISIO_HORIZON_MOVE_SPEED * deltaSeconds,
        );
        camera.updateMatrixWorld();
    }

    function updateChunkVisual(): void {
        if (!camera) {
            return;
        }

        const horizon = createCurrentHorizon(camera);
        updateStatusFromHorizon(horizon);
        const nextVisualSignature = horizon.signature;

        if (nextVisualSignature === activeVisualSignature) {
            return;
        }

        replaceChunkVisual(horizon, nextVisualSignature);
    }

    function createCurrentHorizon(
        currentCamera: ThreePerspectiveCamera,
    ): ChunkViewHorizon {
        currentCamera.updateMatrixWorld();
        const forwardWorldDirection = newVector3();
        const rightWorldDirection = newVector3();
        const upWorldDirection = newVector3();
        currentCamera.getWorldDirection(forwardWorldDirection);
        rightWorldDirection
            .setFromMatrixColumn(currentCamera.matrixWorld, 0)
            .normalize();
        upWorldDirection
            .setFromMatrixColumn(currentCamera.matrixWorld, 1)
            .normalize();

        return createChunkViewHorizon({
            dimensions: VISIO_HORIZON_CHUNK_DIMENSIONS,
            edgeBufferRadians: VISIO_HORIZON_EDGE_BUFFER_RADIANS,
            fadeStartRatio: VISIO_HORIZON_FADE_START_RATIO,
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
            viewDistance: VISIO_HORIZON_VIEW_DISTANCE,
        });
    }

    function updateStatusFromHorizon(horizon: ChunkViewHorizon): void {
        status = {
            activeChunkCount: horizon.bounds.length,
            chunkKeys: horizon.bounds.map((bounds) => bounds.key),
            directionLabel: getDirectionLabel(horizon.currentChunkCoordinate),
            observerChunkKey: getChunkKey(horizon.currentChunkCoordinate),
            pointerLockLabel:
                pointerLockElement === canvas
                    ? "Mouse Look Active"
                    : "Click View",
            positionLabel: camera
                ? `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`
                : "0, 0, 0",
        };
    }

    function replaceChunkVisual(
        horizon: ChunkViewHorizon,
        visualSignature: string,
    ): void {
        const module = threeModule;
        if (!scene || !module) {
            return;
        }

        removeChunkVisual();
        chunkVisualGroup = createChunkVisualGroup(module, horizon.bounds);
        scene.add(chunkVisualGroup);
        activeVisualSignature = visualSignature;
    }

    function createChunkVisualGroup(
        module: ThreeModule,
        boundsList: readonly ChunkViewHorizonBounds[],
    ): ThreeGroup {
        const group = new module.Group();

        for (const bounds of boundsList) {
            group.add(createChunkBoundsVisual(module, bounds));
        }

        return group;
    }

    function createChunkBoundsVisual(
        module: ThreeModule,
        bounds: ChunkViewHorizonBounds,
    ): ThreeGroup {
        const group = new module.Group();
        const width = bounds.max.x - bounds.min.x;
        const height = bounds.max.y - bounds.min.y;
        const depth = bounds.max.z - bounds.min.z;
        const centerX = (bounds.min.x + bounds.max.x) / 2;
        const centerY = (bounds.min.y + bounds.max.y) / 2;
        const centerZ = (bounds.min.z + bounds.max.z) / 2;
        const wireframeMaterial = new module.LineBasicMaterial({
            color: blendChunkColor(module, bounds.fadeProgress),
            opacity: 1 - bounds.fadeProgress * 0.55,
            transparent: true,
        });
        const fillMaterial = new module.MeshBasicMaterial({
            color: blendChunkColor(module, bounds.fadeProgress),
            opacity: 0.06 + (1 - bounds.fadeProgress) * 0.08,
            transparent: true,
            depthWrite: false,
        });
        const boxGeometry = new module.BoxGeometry(width, height, depth);
        const edgeGeometry = new module.EdgesGeometry(boxGeometry);
        const fillMesh = new module.Mesh(boxGeometry, fillMaterial);
        const edgeLines = new module.LineSegments(
            edgeGeometry,
            wireframeMaterial,
        );
        fillMesh.position.set(centerX, centerY, centerZ);
        edgeLines.position.set(centerX, centerY, centerZ);
        group.add(fillMesh);
        group.add(edgeLines);
        return group;
    }

    function blendChunkColor(
        module: ThreeModule,
        fadeProgress: number,
    ): ThreeColorRepresentation {
        const color = new module.Color(VISIO_HORIZON_NEAR_COLOR);
        color.lerp(new module.Color(VISIO_HORIZON_FAR_COLOR), fadeProgress);
        return color;
    }

    function createReferenceGrid(module: ThreeModule): ThreeGroup {
        const group = new module.Group();
        const gridSize =
            VISIO_HORIZON_GRID_EXTENT * VISIO_HORIZON_CHUNK_DIMENSIONS.width;
        const divisions = VISIO_HORIZON_GRID_EXTENT * 2;
        const gridHelper = new module.GridHelper(
            gridSize,
            divisions,
            0x334155,
            0x172033,
        );
        group.add(gridHelper);
        return group;
    }

    function createAxisTripod(module: ThreeModule): ThreeGroup {
        const group = new module.Group();
        group.add(
            createAxisLine(
                module,
                { x: -6, y: 0, z: 0 },
                { x: 6, y: 0, z: 0 },
                0xfb7185,
            ),
        );
        group.add(
            createAxisLine(
                module,
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 6, z: 0 },
                0x4ade80,
            ),
        );
        group.add(
            createAxisLine(
                module,
                { x: 0, y: 0, z: -6 },
                { x: 0, y: 0, z: 6 },
                0x60a5fa,
            ),
        );
        return group;
    }

    function createAxisLine(
        module: ThreeModule,
        start: Readonly<{ x: number; y: number; z: number }>,
        end: Readonly<{ x: number; y: number; z: number }>,
        color: ThreeColorRepresentation,
    ): import("three").LineSegments {
        const geometry = new module.BufferGeometry().setFromPoints([
            new module.Vector3(start.x, start.y, start.z),
            new module.Vector3(end.x, end.y, end.z),
        ]);
        const material = new module.LineBasicMaterial({ color });
        return new module.LineSegments(geometry, material);
    }

    function createObserverMarker(module: ThreeModule): ThreeGroup {
        const group = new module.Group();
        const marker = new module.Mesh(
            new module.SphereGeometry(0.6, 16, 16),
            new module.MeshStandardMaterial({
                color: 0xf8fafc,
                emissive: 0x93c5fd,
                emissiveIntensity: 0.5,
            }),
        );
        marker.position.set(0, VISIO_HORIZON_INITIAL_CAMERA_POSITION.y, 0);
        group.add(marker);
        return group;
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

        yawRadians -= event.movementX * VISIO_HORIZON_LOOK_SENSITIVITY;
        pitchRadians -= event.movementY * VISIO_HORIZON_LOOK_SENSITIVITY;
        pitchRadians = Math.max(
            -VISIO_HORIZON_MAX_PITCH_RADIANS,
            Math.min(VISIO_HORIZON_MAX_PITCH_RADIANS, pitchRadians),
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

    function removeChunkVisual(): void {
        if (!scene || !chunkVisualGroup) {
            activeVisualSignature = "";
            return;
        }

        scene.remove(chunkVisualGroup);
        disposeSceneNode(chunkVisualGroup);
        chunkVisualGroup = null;
        activeVisualSignature = "";
    }

    function cleanupScene(): void {
        resizeObserver?.disconnect();
        resizeObserver = null;
        renderer?.setAnimationLoop(null);
        removeChunkVisual();
        renderer?.dispose();
        renderer = null;
        camera = null;
        scene = null;
        threeModule = null;
        previousFrameTimeMilliseconds = undefined;
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

    function getDirectionLabel(direction: {
        x: number;
        y: number;
        z: number;
    }): DirectionLabel {
        const absX = Math.abs(direction.x);
        const absY = Math.abs(direction.y);
        const absZ = Math.abs(direction.z);

        if (absX >= absY && absX >= absZ) {
            return direction.x >= 0
                ? DIRECTION_BY_AXIS_SIGN.x.positive
                : DIRECTION_BY_AXIS_SIGN.x.negative;
        }

        if (absY >= absX && absY >= absZ) {
            return direction.y >= 0
                ? DIRECTION_BY_AXIS_SIGN.y.positive
                : DIRECTION_BY_AXIS_SIGN.y.negative;
        }

        return direction.z >= 0
            ? DIRECTION_BY_AXIS_SIGN.z.positive
            : DIRECTION_BY_AXIS_SIGN.z.negative;
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
            throw new Error(
                "Three.js module must be loaded before creating vectors.",
            );
        }

        return new threeModule.Vector3();
    }
</script>

<svelte:head>
    <title>Visio Chunk Horizon Lab</title>
</svelte:head>

<div class="page-shell">
    <div class="page-content">
        <div class="viewport-card">
            <div class="viewport" bind:this={container}>
                <canvas
                    bind:this={canvas}
                    aria-label="Visio chunk horizon debug viewport"
                    onclick={requestPointerLock}
                ></canvas>
            </div>
        </div>

        <VisioChunkHorizonDebugPanel {status} />
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
        grid-template-columns: minmax(0, 1fr) 340px;
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
