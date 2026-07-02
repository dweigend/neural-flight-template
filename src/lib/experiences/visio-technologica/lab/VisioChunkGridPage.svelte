<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import {
        createCenteredChunkGridCoordinates,
        createKeyedChunkBounds,
        type ChunkCoordinate,
        type ChunkDimensions,
        type ChunkGridCounts,
        type KeyedChunkBounds,
    } from "$lib/experiences/visio-technologica/chunk-core";

    type ThreeModule = typeof import("three");
    type ThreeColorRepresentation = import("three").ColorRepresentation;
    type ThreeGroup = import("three").Group;
    type ThreeLineSegments = import("three").LineSegments;
    type ThreePerspectiveCamera = import("three").PerspectiveCamera;
    type ThreeScene = import("three").Scene;
    type ThreeWebGLRenderer = import("three").WebGLRenderer;

    type ChunkGridDebugState = Readonly<{
        bounds: readonly KeyedChunkBounds[];
        chunkDimensions: ChunkDimensions;
        chunkKeys: readonly string[];
        counts: ChunkGridCounts;
        coordinateOffset: ChunkCoordinate;
    }>;

    const CHUNK_DIMENSIONS: ChunkDimensions = {
        width: 1,
        height: 64,
        depth: 1,
    };

    const CHUNK_COUNTS: ChunkGridCounts = {
        xAxisChunkCount: 7,
        yAxisChunkCount: 1,
        zAxisChunkCount: 7,
    };

    const CHUNK_COORDINATE_OFFSET: ChunkCoordinate = {
        x: 0,
        y: 0,
        z: 0,
    };

    const debugState: ChunkGridDebugState = createChunkGridDebugState({
        chunkDimensions: CHUNK_DIMENSIONS,
        coordinateOffset: CHUNK_COORDINATE_OFFSET,
        counts: CHUNK_COUNTS,
    });

    let container: HTMLDivElement | undefined = $state();
    let canvas: HTMLCanvasElement | undefined = $state();
    let chunkCountSummary = $derived(debugState.bounds.length);
    let scene: ThreeScene | null = null;
    let camera: ThreePerspectiveCamera | null = null;
    let renderer: ThreeWebGLRenderer | null = null;
    let chunkDebugGroup: ThreeGroup | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let threeModule: ThreeModule | null = null;

    onMount(() => {
        let cancelled = false;

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
            scene.background = new module.Color(0x0b1220);

            camera = new module.PerspectiveCamera(52, 1, 0.1, 500);
            camera.position.set(6.8, 5.6, 6.8);
            camera.lookAt(0, 0, 0);

            renderer = new module.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            scene.add(new module.AmbientLight(0xffffff, 1.4));

            const keyLight = new module.DirectionalLight(0xffffff, 2.2);
            keyLight.position.set(6, 9, 4);
            scene.add(keyLight);

            const fillLight = new module.DirectionalLight(0x7dd3fc, 0.85);
            fillLight.position.set(-5, 4, -6);
            scene.add(fillLight);

            chunkDebugGroup = createChunkDebugGroup(module, debugState.bounds);
            scene.add(chunkDebugGroup);
            scene.add(createWorldAxes(module));
            scene.add(createGroundPlane(module));

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

            renderer.setAnimationLoop(() => {
                if (!renderer || !scene || !camera) {
                    return;
                }

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

    function createChunkGridDebugState({
        chunkDimensions,
        coordinateOffset,
        counts,
    }: Readonly<{
        chunkDimensions: ChunkDimensions;
        coordinateOffset: ChunkCoordinate;
        counts: ChunkGridCounts;
    }>): ChunkGridDebugState {
        const coordinates = createCenteredChunkGridCoordinates({
            coordinateOffset,
            counts,
        });
        const bounds = createKeyedChunkBounds({
            coordinates,
            dimensions: chunkDimensions,
        });

        return {
            bounds,
            chunkDimensions,
            chunkKeys: bounds.map((chunkBounds) => chunkBounds.key),
            counts,
            coordinateOffset,
        };
    }

    function createChunkDebugGroup(
        module: ThreeModule,
        boundsList: readonly KeyedChunkBounds[],
    ): ThreeGroup {
        const group = new module.Group();

        for (const bounds of boundsList) {
            group.add(createChunkWireframe(module, bounds));
        }

        return group;
    }

    function createChunkWireframe(
        module: ThreeModule,
        bounds: KeyedChunkBounds,
    ): ThreeLineSegments {
        const sizeX = bounds.max.x - bounds.min.x;
        const sizeY = bounds.max.y - bounds.min.y;
        const sizeZ = bounds.max.z - bounds.min.z;
        const geometry = new module.EdgesGeometry(
            new module.BoxGeometry(sizeX, sizeY, sizeZ),
        );
        const material = new module.LineBasicMaterial({
            color: getChunkColor(bounds.coordinate),
            transparent: true,
            opacity: bounds.key === "0:0:0" ? 1 : 0.66,
            linewidth: 1,
        });
        const wireframe = new module.LineSegments(geometry, material);
        wireframe.position.set(
            (bounds.min.x + bounds.max.x) / 2,
            (bounds.min.y + bounds.max.y) / 2,
            (bounds.min.z + bounds.max.z) / 2,
        );

        return wireframe;
    }

    function createWorldAxes(module: ThreeModule): ThreeGroup {
        const group = new module.Group();
        group.add(
            createAxisLine(
                module,
                { x: -5, y: 0, z: 0 },
                { x: 5, y: 0, z: 0 },
                0xfb7185,
            ),
        );
        group.add(
            createAxisLine(
                module,
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 4, z: 0 },
                0x4ade80,
            ),
        );
        group.add(
            createAxisLine(
                module,
                { x: 0, y: 0, z: -5 },
                { x: 0, y: 0, z: 5 },
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
    ): ThreeLineSegments {
        const geometry = new module.BufferGeometry().setFromPoints([
            new module.Vector3(start.x, start.y, start.z),
            new module.Vector3(end.x, end.y, end.z),
        ]);
        const material = new module.LineBasicMaterial({ color });

        return new module.LineSegments(geometry, material);
    }

    function createGroundPlane(module: ThreeModule): ThreeGroup {
        const group = new module.Group();
        const gridHelper = new module.GridHelper(14, 14, 0x334155, 0x1e293b);
        gridHelper.position.y = 0;
        group.add(gridHelper);

        const plane = new module.Mesh(
            new module.PlaneGeometry(14, 14),
            new module.MeshStandardMaterial({
                color: 0x0f172a,
                roughness: 0.92,
                metalness: 0.02,
                transparent: true,
                opacity: 0.7,
            }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.02;
        group.add(plane);

        return group;
    }

    function getChunkColor(
        coordinate: ChunkCoordinate,
    ): ThreeColorRepresentation {
        if (coordinate.x === 0 && coordinate.y === 0 && coordinate.z === 0) {
            return 0xf59e0b;
        }

        const isEven = Math.abs(coordinate.x + coordinate.z) % 2 === 0;
        return isEven ? 0x38bdf8 : 0x818cf8;
    }

    function cleanupScene(): void {
        resizeObserver?.disconnect();
        resizeObserver = null;
        renderer?.setAnimationLoop(null);
        disposeSceneNode(chunkDebugGroup);
        renderer?.dispose();
        chunkDebugGroup = null;
        renderer = null;
        camera = null;
        scene = null;
        threeModule = null;
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
</script>

<svelte:head>
    <title>Visio Chunk Grid Lab</title>
</svelte:head>

<div class="page-shell">
    <div class="page-content">
        <div class="viewport-card">
            <div class="viewport" bind:this={container}>
                <canvas
                    bind:this={canvas}
                    aria-label="Visio chunk grid debug viewport"
                ></canvas>
            </div>
        </div>

        <aside class="debug-panel">
            <h1>Visio Chunk Grid Lab</h1>
            <p>
                Static validation page for <code>chunk-core</code>. No GLB
                loading, no horizon selection, only chunk coordinate and bounds
                visualization.
            </p>

            <div class="summary-grid">
                <div>
                    <span class="label">Chunk size</span>
                    <strong>
                        {debugState.chunkDimensions.width} × {debugState
                            .chunkDimensions.height} ×
                        {debugState.chunkDimensions.depth}
                    </strong>
                </div>
                <div>
                    <span class="label">Chunk counts</span>
                    <strong>
                        {debugState.counts.xAxisChunkCount} × {debugState.counts
                            .yAxisChunkCount} ×
                        {debugState.counts.zAxisChunkCount}
                    </strong>
                </div>
                <div>
                    <span class="label">Coordinate offset</span>
                    <strong>
                        {debugState.coordinateOffset.x}, {debugState
                            .coordinateOffset.y},
                        {debugState.coordinateOffset.z}
                    </strong>
                </div>
                <div>
                    <span class="label">Visible chunk count</span>
                    <strong>{chunkCountSummary}</strong>
                </div>
            </div>

            <div>
                <h2>Chunk keys</h2>
                <ul class="key-list">
                    {#each debugState.chunkKeys as chunkKey}
                        <li>{chunkKey}</li>
                    {/each}
                </ul>
            </div>
        </aside>
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
    }

    .debug-panel {
        padding: 1.25rem;
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 1rem;
        overflow: auto;
        max-height: min(62vh, 680px);
    }

    h1 {
        font-size: 1.2rem;
        margin: 0 0 0.75rem;
    }

    h2 {
        font-size: 0.95rem;
        margin: 1.25rem 0 0.5rem;
    }

    p {
        margin: 0 0 1rem;
        color: #cbd5e1;
        line-height: 1.45;
    }

    code {
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.75rem;
    }

    .summary-grid > div {
        padding: 0.75rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 0.75rem;
        background: rgba(15, 23, 42, 0.5);
    }

    .label {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
        margin-bottom: 0.25rem;
    }

    strong {
        font-size: 0.95rem;
    }

    .key-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.82rem;
    }

    .key-list li {
        padding: 0.45rem 0.55rem;
        border-radius: 0.5rem;
        background: rgba(30, 41, 59, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.12);
    }

    @media (max-width: 960px) {
        .page-content {
            grid-template-columns: 1fr;
        }

        .viewport {
            max-height: min(52vh, 480px);
        }

        .debug-panel {
            max-height: none;
        }
    }
</style>
