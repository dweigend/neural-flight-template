<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import {
    CyberOverlay,
    createResponsiveGrid,
    applyResponsiveLayout,
    redrawAll,
    getTexts,
    COMPUTED_TEXTS,
    CYBER,
  } from "$lib/experiences/visio-technologica/lennard/scripts/cyber-overlay";

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let gridOverlays: CyberOverlay[] = [];

  function buildOverlays(camera: THREE.PerspectiveCamera): CyberOverlay[] {
    const overlays = createResponsiveGrid(getTexts(), camera);
    for (const ov of overlays) camera.add(ov.sprite);
    return overlays;
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    camera.position.set(0, 10, 30);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(10, 30, 10);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(60, 20, 0x00ffcc, 0x003366);
    scene.add(gridHelper);

    const cubes: THREE.Mesh[] = [];
    for (let i = 0; i < 40; i++) {
      const size = 0.5 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.4),
        metalness: 0.3,
        roughness: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 50 - 20,
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      scene.add(mesh);
      cubes.push(mesh);
    }

    gridOverlays = buildOverlays(camera);

    // ── Console helpers ──
    const w = window as unknown as Record<string, unknown>;
    w.CYBER = CYBER;
    w.overlays = gridOverlays;
    w.CYBER = CYBER;
    w.texts = COMPUTED_TEXTS;
    w.camera = camera;
    w.redraw = () => redrawAll(gridOverlays);
    w.relayout = () =>
      applyResponsiveLayout(gridOverlays, camera);
    w.rebuild = () => {
      for (const ov of gridOverlays) {
        camera.remove(ov.sprite);
        ov.dispose();
      }
      gridOverlays = createResponsiveGrid(getTexts(), camera);
      for (const ov of gridOverlays) camera.add(ov.sprite);
      w.overlays = gridOverlays;
    };

    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      cubes.forEach((cube, i) => {
        cube.rotation.x += 0.005;
        cube.rotation.y += 0.01;
        cube.position.y += Math.sin(t * 0.5 + i) * 0.002;
      });
      controls.update();
      renderer.render(scene, camera);
    });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      applyResponsiveLayout(gridOverlays, camera);
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);
  });

  onDestroy(() => {
    renderer?.setAnimationLoop(null);
    controls?.dispose();
    for (const ov of gridOverlays) ov.dispose();
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
    background: #000;
  }
</style>
