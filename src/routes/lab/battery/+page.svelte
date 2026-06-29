<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import {
    BatteryOverlay,
    BATTERY,
  } from "$lib/experiences/visio-technologica/lennard/scripts/battery-overlay";

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let battery: BatteryOverlay;

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
    camera.position.set(0, 2, 5);
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

    battery = new BatteryOverlay();
    battery.attachToCamera(camera);
    battery.start();

    // ── Console helpers ──
    const w = window as unknown as Record<string, unknown>;
    w.BATTERY = BATTERY;
    w.battery = battery;
    w.camera = camera;
    w.restart = () => { battery.start(); };
    w.reset = () => { battery.reset(); };
    w.redraw = () => { battery.redraw(); };

    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      cubes.forEach((cube, i) => {
        cube.rotation.x += 0.005;
        cube.rotation.y += 0.01;
        cube.position.y += Math.sin(t * 0.5 + i) * 0.002;
      });
      controls.update();
      battery.update(performance.now());
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
    controls?.dispose();
    battery?.dispose();
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
