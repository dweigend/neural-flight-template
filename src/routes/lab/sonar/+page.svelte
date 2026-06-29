<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { SonarOverlay, SONAR } from "$lib/experiences/visio-technologica/lennard/scripts/sonar-overlay";

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let overlay: SonarOverlay;

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
    camera.position.set(0, 0, 0);

    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, -5);
    controls.update();

    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    overlay = new SonarOverlay();
    overlay.attachToCamera(camera);
    scene.add(camera);

    const w = window as unknown as Record<string, unknown>;
    w.overlay = overlay;
    w.SONAR = SONAR;

    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      overlay.update();
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
    overlay?.dispose();
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
    background: #000;
  }
</style>
