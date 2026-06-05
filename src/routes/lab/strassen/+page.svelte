<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { VISIO_TECHNOLOGICA_TILE_METADATA } from "$lib/experiences/visio-technologica/tile-metadata";
  import { buildRoadGraph, type TileInfo } from "$lib/experiences/visio-technologica/lennard/straßen/road-graph";
  import { createCarFleet } from "$lib/experiences/visio-technologica/lennard/straßen/car-fleet";

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let fleet: ReturnType<typeof createCarFleet>;

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(200, 300, 400);
    camera.lookAt(0, 0, 0);

    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(100, 200, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -300;
    dirLight.shadow.camera.right = 300;
    dirLight.shadow.camera.top = 300;
    dirLight.shadow.camera.bottom = -300;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362d59, 0.4);
    scene.add(hemiLight);

    const gridHelper = new THREE.GridHelper(600, 20, 0x444466, 0x333355);
    scene.add(gridHelper);

    const columns = [...new Set(VISIO_TECHNOLOGICA_TILE_METADATA.map((t) => t.center.x))].sort((a, b) => a - b);
    const rows = [...new Set(VISIO_TECHNOLOGICA_TILE_METADATA.map((t) => t.center.y))].sort((a, b) => a - b);
    const colIndex = new Map(columns.map((x, i) => [x, i]));
    const rowIndex = new Map(rows.map((y, i) => [y, i]));

    const STEP = 80;
    const centerCol = (columns.length - 1) / 2;
    const centerRow = (rows.length - 1) / 2;

    const tiles: TileInfo[] = VISIO_TECHNOLOGICA_TILE_METADATA.map((t) => {
      const ci = colIndex.get(t.center.x) ?? 0;
      const ri = rowIndex.get(t.center.y) ?? 0;
      return {
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        worldPosition: new THREE.Vector3(
          (ci - centerCol) * STEP,
          0,
          (ri - centerRow) * STEP,
        ),
      };
    });

    const graph = buildRoadGraph(tiles);
    fleet = createCarFleet(graph, 6);
    scene.add(fleet.roadGroup);
    scene.add(fleet.carGroup);

    for (const node of graph.nodes.values()) {
      const sphereGeo = new THREE.SphereGeometry(2, 8, 8);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.copy(node.position);
      scene.add(sphere);
    }

    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      fleet.update(delta, graph);
      controls.update();
      renderer.render(scene, camera);
    });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);
  });

  onDestroy(() => {
    renderer?.setAnimationLoop(null);
    fleet?.dispose();
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    display: block;
    width: 100vw;
    height: 100vh;
  }

  :global(body) {
    margin: 0;
    overflow: hidden;
  }
</style>
