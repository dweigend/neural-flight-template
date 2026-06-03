import * as THREE from "three";

import { LineCurve3, TubeGeometry } from "three";

import type { ExperienceState, SetupContext, TickContext } from "../types";

import { createCanalMaterial, createFogMaterial } from "./shaders";

import meatDiffuseUrl from "./textures/Ground Beef/Meat 001_diffuse.png";

// ── Constants ──

const TUBE_RADIUS = 3.5;

const TUBE_LENGTH = 500;

const TUBE_NEAR_END = 10;

const TUBE_FAR_END = -(TUBE_LENGTH - 10);

const TUBE_RAD_SEG = 32;

const TUBE_Z_SEG = 100;

// ── Phase definitions ──

interface PhaseDef {
  speed: number;

  periStrength: number;

  pushAmp: number;

  shapeDist: number;

  shapeScale: number;

  bright: number;

  color1: [number, number, number];

  color2: [number, number, number];

  color3: [number, number, number];
}

const PHASES: PhaseDef[] = [
  {
    speed: 3,
    periStrength: 8.0,
    pushAmp: 2,
    shapeDist: -200,
    shapeScale: 0.3,
    bright: 0.7,

    color1: [0.2, 0.02, 0.05],
    color2: [0.12, 0.01, 0.03],
    color3: [0.3, 0.04, 0.1],
  },

  {
    speed: 5,
    periStrength: 6.0,
    pushAmp: 5,
    shapeDist: -180,
    shapeScale: 0.4,
    bright: 0.9,

    color1: [0.16, 0.02, 0.09],
    color2: [0.07, 0.01, 0.04],
    color3: [0.25, 0.05, 0.14],
  },

  {
    speed: 8,
    periStrength: 4.0,
    pushAmp: 7,
    shapeDist: -160,
    shapeScale: 0.5,
    bright: 1.0,

    color1: [0.22, 0.07, 0.15],
    color2: [0.1, 0.02, 0.05],
    color3: [0.32, 0.12, 0.2],
  },

  {
    speed: 14,
    periStrength: 5.0,
    pushAmp: 12,
    shapeDist: -140,
    shapeScale: 0.6,
    bright: 1.2,

    color1: [0.3, 0.05, 0.16],
    color2: [0.18, 0.02, 0.07],
    color3: [0.4, 0.1, 0.22],
  },

  {
    speed: 18,
    periStrength: 2.0,
    pushAmp: 10,
    shapeDist: -80,
    shapeScale: 1.0,
    bright: 1.5,

    color1: [0.35, 0.09, 0.2],
    color2: [0.22, 0.04, 0.1],
    color3: [0.45, 0.15, 0.28],
  },

  {
    speed: 25,
    periStrength: 0.0,
    pushAmp: 0,
    shapeDist: -30,
    shapeScale: 2.5,
    bright: 1.8,

    color1: [0.4, 0.15, 0.28],
    color2: [0.3, 0.05, 0.15],
    color3: [0.5, 0.22, 0.38],
  },
];

// ── Straight tube ──

function buildCanal(material: THREE.ShaderMaterial): THREE.Mesh {
  const path = new LineCurve3(
    new THREE.Vector3(0, 0, TUBE_NEAR_END),

    new THREE.Vector3(0, 0, TUBE_FAR_END),
  );

  const geo = new TubeGeometry(
    path,
    TUBE_Z_SEG,
    TUBE_RADIUS,
    TUBE_RAD_SEG,
    false,
  );

  return new THREE.Mesh(geo, material);
}

function buildNebulaMist(matsArray: THREE.ShaderMaterial[]): THREE.Group {
  const group = new THREE.Group();
  const fogGeo = new THREE.PlaneGeometry(6, 6);

  // Generiere 60 Nebel-Wolken im Tunnel
  for (let i = 0; i < 60; i++) {
    const zPos = Math.random() * (TUBE_FAR_END - TUBE_NEAR_END) + TUBE_NEAR_END;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1.5; // Relativ mittig im Tunnel halten

    const mat = createFogMaterial();
    mat.uniforms.uOffset.value = Math.random() * 10;
    matsArray.push(mat);

    const fog = new THREE.Mesh(fogGeo, mat);
    // Positionieren. Das Biegen übernimmt der Vertex-Shader!
    fog.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, zPos);
    fog.rotation.z = Math.random() * Math.PI;
    group.add(fog);
  }
  return group;
}

// ── State ──

export interface B1LesserState extends ExperienceState {
  elapsed: number;

  camera: THREE.PerspectiveCamera;

  scene: THREE.Scene | null;

  renderer: THREE.WebGLRenderer | null;

  canalMat: THREE.ShaderMaterial;

  fogMats: THREE.ShaderMaterial[];

  canal: THREE.Mesh;

  phase: number;

  phaseTime: number;

  keys: Set<string>;

  removeListener: (() => void) | null;
}

// ── Setup ──

export async function setup(ctx: SetupContext): Promise<B1LesserState> {
  const renderer = ctx.renderer;

  renderer.xr.enabled = true;

  ctx.scene.background = new THREE.Color(0x000000);

  const canalMat = createCanalMaterial();

  const canalMesh = buildCanal(canalMat);

  const texLoader = new THREE.TextureLoader();

  const diffuseTex = texLoader.load(meatDiffuseUrl);

  diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;

  diffuseTex.repeat.set(1, 1);

  canalMat.uniforms.uDiffuse.value = diffuseTex;

  ctx.camera.position.set(0, 0, TUBE_NEAR_END);

  ctx.scene.add(canalMesh);

  const fogMats: THREE.ShaderMaterial[] = [];
  const nebulaSystem = buildNebulaMist(fogMats);
  ctx.scene.add(nebulaSystem);

  const state: B1LesserState = {
    elapsed: 0,
    camera: ctx.camera,
    scene: ctx.scene,
    renderer,
    canal: canalMesh,
    canalMat,
    fogMats,
    phase: 1,
    phaseTime: 0,
    keys: new Set(),
    removeListener: null,
  };

  applyPhase(state, 1);

  const onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    const num =
      k.length === 1 ? parseInt(k) : parseInt(k.replace("Numpad", ""));
    if (!isNaN(num) && num >= 1 && num <= 6) {
      applyPhase(state, num);
    }
    state.keys.add(k.toLowerCase());
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    state.keys.delete(e.key.toLowerCase());
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKeyUp);

  state.removeListener = () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("keyup", onKeyUp);
  };

  return state;
}

function applyPhase(s: B1LesserState, phase: number): void {
  s.phase = phase;

  s.phaseTime = 0;

  const p = PHASES[phase - 1];

  s.canalMat.uniforms.uPeriStrength.value = p.periStrength;

  s.canalMat.uniforms.uColor1.value.setRGB(
    p.color1[0],
    p.color1[1],
    p.color1[2],
  );

  s.canalMat.uniforms.uColor2.value.setRGB(
    p.color2[0],
    p.color2[1],
    p.color2[2],
  );

  s.canalMat.uniforms.uColor3.value.setRGB(
    p.color3[0],
    p.color3[1],
    p.color3[2],
  );

  s.canalMat.uniforms.uPhase.value = (phase - 1) / 5;

  s.canalMat.uniforms.uNearEnd.value = TUBE_NEAR_END;

  s.canalMat.uniforms.uFarEnd.value = TUBE_FAR_END;

  s.canalMat.uniforms.uBright.value = p.bright;
}

// ── Tick ──

export function tick(
  state: ExperienceState,

  ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
  const s = state as B1LesserState;

  s.elapsed += ctx.delta;

  for (const mat of s.fogMats) {
    mat.uniforms.uTime.value = s.elapsed;
  }

  s.phaseTime += ctx.delta;

  const phase = s.phase;

  const p = PHASES[phase - 1];

  s.canalMat.uniforms.uTime.value = s.elapsed;

  const periPulse = 0.8 + 0.2 * Math.sin(s.elapsed * 0.8);

  if (phase === 2 || phase === 4) {
    s.canalMat.uniforms.uPeriStrength.value = p.periStrength * periPulse;
  }

  // Binocular shapes follow phase

  const shapePulse = 0.7 + 0.3 * Math.sin(s.elapsed * 0.5);

  s.canalMat.uniforms.uShapeZ.value = p.shapeDist;

  s.canalMat.uniforms.uShapeScale.value =
    p.shapeScale * (0.8 + 0.2 * shapePulse);

  // Push along tube

  const pushWave = Math.sin(s.elapsed * 0.4) * 0.5 + 0.5;

  const baseSpeed = p.speed;

  const pushBonus = p.pushAmp * pushWave;

  const step = (baseSpeed + pushBonus) * ctx.delta;

  s.camera.position.z -= step;

  // WASD (world-space: W=forward/Z, A/D=strafe/X)
  applyWASD(s, ctx.delta);

  // Clamp camera inside tube
  s.camera.position.z = Math.min(
    TUBE_NEAR_END,
    Math.max(TUBE_FAR_END, s.camera.position.z),
  );

  // Gentle tube-bend guide (lerp, not overwrite — preserves WASD strafe)
  const camZ = s.camera.position.z;
  const targetX = Math.sin(camZ * 0.015) * 2.0;
  const targetY = Math.cos(camZ * 0.01) * 1.2;
  s.camera.position.x += (targetX - s.camera.position.x) * 0.02;
  s.camera.position.y += (targetY - s.camera.position.y) * 0.02;

  // Moving light ahead of camera
  s.canalMat.uniforms.uLightZ.value = camZ - 30;

  return { state: s };
}

function applyWASD(s: B1LesserState, delta: number): void {
  const keys = s.keys;
  const speed = 8 * delta;
  if (keys.has("w")) s.camera.position.z -= speed;
  if (keys.has("s")) s.camera.position.z += speed;
  if (keys.has("a")) s.camera.position.x -= speed;
  if (keys.has("d")) s.camera.position.x += speed;
}

// ── Lifecycle ──

export function applySettings(
  _id: string,

  _value: number | boolean | string,

  _state: ExperienceState,

  _scene: THREE.Scene,
): void {}

export function updatePlayer(
  _orientation: { pitch: number; roll: number },

  _speed: { accelerate: boolean; brake: boolean },

  _state: ExperienceState,

  _delta: number,
): void {}

export function dispose(state: ExperienceState, _scene: THREE.Scene): void {
  const s = state as B1LesserState;

  s.removeListener?.();

  s.canal.geometry.dispose();

  s.canalMat.dispose();
  s.fogMats.forEach((m) => m.dispose());
}
