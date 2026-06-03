import * as THREE from "three";
import { LineCurve3, TubeGeometry, CatmullRomCurve3 } from "three";

import { EffectComposer, RenderPass, BloomEffect, EffectPass } from "postprocessing";

import type { ExperienceState, SetupContext, TickContext } from "../types";

import {
	createCanalMaterial,
	createFogMaterial,
	createStarField,
	createOutlineMaterial,
	createToonGradient,
	createDuneToonMaterial,
	createHexPrismGeometry,
	createVoidSphereMaterial,
} from "./shaders";

import meatDiffuseUrl from "./textures/Ground Beef/Meat 001_diffuse.png";

// ── Constants ──

const TUBE_RADIUS = 3.5;
const TUBE_LENGTH = 500;
const TUBE_NEAR_END = 10;
const TUBE_FAR_END = -(TUBE_LENGTH - 10);
const TUBE_RAD_SEG = 32;
const TUBE_Z_SEG = 100;

const CANYON_WIDTH = 30;
const CANYON_LENGTH = 500;
const CANYON_SEG_W = 64;
const CANYON_SEG_L = 128;

const CRYSTAL_COUNT = 12;
const CRYSTAL_INSTANCE_COUNT = 48;
const BALL_COUNT = 12;
const TRAIL_POINTS = 80;
const HALF_TRAIL = TRAIL_POINTS / 2;

const VOID_FADE_DURATION = 5.0;
const TRANSITION_DURATION = 2.0;
const FADE_IN_DURATION = 10;

// ── Phase definitions ──

interface TunnelPhaseDef {
	type: "tunnel";
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

interface DunePhaseDef {
	type: "dune";
	speed: number;
	pushAmp: number;
	duneColor1: [number, number, number];
	duneColor2: [number, number, number];
	duneColor3: [number, number, number];
	crystalSpeed: number;
	ballSpeed: number;
	bright: number;
	warpStrength: number;
	warpMode: number;
	shakeMag: number;
}

type PhaseDef = TunnelPhaseDef | DunePhaseDef;

const PHASES: PhaseDef[] = [
	{
		type: "tunnel",
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
		type: "dune",
		speed: 4,
		pushAmp: 3,
		duneColor1: [0.58, 0.24, 0.51],
		duneColor2: [0.35, 0.12, 0.25],
		duneColor3: [0.77, 0.48, 0.61],
		crystalSpeed: 0.3,
		ballSpeed: 0.6,
		bright: 1.0,
		warpStrength: 0.0,
		warpMode: 0,
		shakeMag: 0.0,
	},
	{
		type: "dune",
		speed: 6,
		pushAmp: 4,
		duneColor1: [0.58, 0.24, 0.51],
		duneColor2: [0.35, 0.12, 0.25],
		duneColor3: [0.77, 0.48, 0.61],
		crystalSpeed: 0.5,
		ballSpeed: 0.8,
		bright: 1.2,
		warpStrength: 1.0,
		warpMode: 0,
		shakeMag: 0.0,
	},
	{
		type: "dune",
		speed: 10,
		pushAmp: 6,
		duneColor1: [0.58, 0.24, 0.51],
		duneColor2: [0.35, 0.12, 0.25],
		duneColor3: [0.77, 0.48, 0.61],
		crystalSpeed: 1.0,
		ballSpeed: 1.5,
		bright: 1.5,
		warpStrength: 3.0,
		warpMode: 1,
		shakeMag: 0.1,
	},
	{
		type: "dune",
		speed: 0,
		pushAmp: 0,
		duneColor1: [0.58, 0.24, 0.51],
		duneColor2: [0.35, 0.12, 0.25],
		duneColor3: [0.77, 0.48, 0.61],
		crystalSpeed: 2.0,
		ballSpeed: 3.0,
		bright: 2.0,
		warpStrength: 5.0,
		warpMode: 0,
		shakeMag: 0.15,
	},
	{
		type: "dune",
		speed: 0,
		pushAmp: 0,
		duneColor1: [0.58, 0.24, 0.51],
		duneColor2: [0.35, 0.12, 0.25],
		duneColor3: [0.77, 0.48, 0.61],
		crystalSpeed: 0,
		ballSpeed: 0,
		bright: 0,
		warpStrength: 0,
		warpMode: 0,
		shakeMag: 0,
	},
];

// ── Crystal data ──

interface CrystalInstance {
	position: THREE.Vector3;
	rotation: THREE.Euler;
	scale: number;
	color: THREE.Color;
}

const CRYSTAL_COLORS = [
	new THREE.Color(0.0, 1.0, 1.0),
	new THREE.Color(0.0, 0.8, 1.0),
	new THREE.Color(0.2, 0.9, 1.0),
	new THREE.Color(0.0, 1.0, 0.9),
	new THREE.Color(0.3, 1.0, 0.6),
];

// ── Ball data ──

interface BallData {
	mesh: THREE.Mesh;
	trail: THREE.Line;
	trailPositions: Float32Array;
	trailColors: Float32Array;
	curve: CatmullRomCurve3;
	pathIdx: number;
	speed: number;
}

// ── Phase 1: Build tube ──

function buildCanal(material: THREE.ShaderMaterial): THREE.Mesh {
	const path = new LineCurve3(
		new THREE.Vector3(0, 0, TUBE_NEAR_END),
		new THREE.Vector3(0, 0, TUBE_FAR_END),
	);
	const geo = new TubeGeometry(path, TUBE_Z_SEG, TUBE_RADIUS, TUBE_RAD_SEG, false);
	return new THREE.Mesh(geo, material);
}

function buildNebulaMist(matsArray: THREE.ShaderMaterial[]): THREE.Group {
	const group = new THREE.Group();
	const fogGeo = new THREE.PlaneGeometry(6, 6);
	for (let i = 0; i < 60; i++) {
		const zPos = Math.random() * (TUBE_FAR_END - TUBE_NEAR_END) + TUBE_NEAR_END;
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * 1.5;
		const mat = createFogMaterial();
		mat.uniforms.uOffset.value = Math.random() * 10;
		matsArray.push(mat);
		const fog = new THREE.Mesh(fogGeo, mat);
		fog.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, zPos);
		fog.rotation.z = Math.random() * Math.PI;
		group.add(fog);
	}
	return group;
}

// ── Phase 2+: Build dune terrain ──

function createDuneGeometry(): THREE.BufferGeometry {
	const positions: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const sw = CANYON_SEG_W;
	const sl = CANYON_SEG_L;
	const hw = CANYON_WIDTH / 2;

	for (let iz = 0; iz <= sl; iz++) {
		const z = TUBE_NEAR_END - (iz / sl) * CANYON_LENGTH;
		for (let ix = 0; ix <= sw; ix++) {
			const x = (ix / sw) * CANYON_WIDTH - hw;
			positions.push(x, 0, z);
			uvs.push(ix / sw, iz / sl);
		}
	}

	for (let iz = 0; iz < sl; iz++) {
		for (let ix = 0; ix < sw; ix++) {
			const a = iz * (sw + 1) + ix;
			const b = iz * (sw + 1) + ix + 1;
			const c = (iz + 1) * (sw + 1) + ix;
			const d = (iz + 1) * (sw + 1) + ix + 1;
			indices.push(a, b, c, b, d, c);
		}
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
	geo.setIndex(indices);
	return geo;
}

function buildTerrain(
	outlineMat: THREE.ShaderMaterial,
): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; outline: THREE.Mesh } {
	const geo = createDuneGeometry();
	const mat = createDuneToonMaterial();
	const mesh = new THREE.Mesh(geo, mat);
	mesh.frustumCulled = false;

	const outlineGeo = geo.clone();
	const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
	outlineMesh.frustumCulled = false;

	return { mesh, mat, outline: outlineMesh };
}

// ── Phase 2+: Build crystals with InstancedMesh ──

function buildCrystalInstances(
	outlineMat: THREE.ShaderMaterial,
): { group: THREE.Group; meshes: THREE.InstancedMesh[] } {
	const group = new THREE.Group();
	const meshes: THREE.InstancedMesh[] = [];
	const PRISM_RADIUS = 0.25;
	const PRISM_HEIGHT = 0.6;

	const hexGeo = createHexPrismGeometry(PRISM_RADIUS, PRISM_HEIGHT);
	const gradient = createToonGradient();

	// Distribute instance data
	const instances: CrystalInstance[] = [];
	for (let i = 0; i < CRYSTAL_INSTANCE_COUNT; i++) {
		const color = CRYSTAL_COLORS[i % CRYSTAL_COLORS.length];
		const s = 0.6 + Math.random() * 1.5;
		const x = (Math.random() - 0.5) * CANYON_WIDTH * 0.7;
		const z = TUBE_NEAR_END - 30 - Math.random() * (CANYON_LENGTH - 60);
		const y = 1.5 + Math.random() * (3 + s * 2);
		instances.push({
			position: new THREE.Vector3(x, y, z),
			rotation: new THREE.Euler(
				Math.random() * Math.PI,
				Math.random() * Math.PI,
				Math.random() * Math.PI,
			),
			scale: s,
			color,
		});
	}

	// Material per color variant
	const colorGroups = new Map<string, { color: THREE.Color; indices: number[] }>();
	for (let i = 0; i < instances.length; i++) {
		const key = instances[i].color.getHexString();
		if (!colorGroups.has(key)) {
			colorGroups.set(key, { color: instances[i].color, indices: [] });
		}
		colorGroups.get(key)!.indices.push(i);
	}

	for (const [, gc] of colorGroups) {
		const mat = new THREE.MeshToonMaterial({
			color: gc.color,
			gradientMap: gradient,
			emissive: gc.color,
			emissiveIntensity: 0.15,
		});
		const instanced = new THREE.InstancedMesh(hexGeo, mat, gc.indices.length);
		const dummy = new THREE.Object3D();
		for (let j = 0; j < gc.indices.length; j++) {
			const inst = instances[gc.indices[j]];
			dummy.position.copy(inst.position);
			dummy.rotation.copy(inst.rotation);
			dummy.scale.setScalar(inst.scale);
			dummy.updateMatrix();
			instanced.setMatrixAt(j, dummy.matrix);
			instanced.setColorAt(j, gc.color);
		}
		instanced.instanceMatrix.needsUpdate = true;
		if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
		instanced.frustumCulled = true;
		group.add(instanced);
		meshes.push(instanced);

		// Outline per InstancedMesh (clone material, same geometry)
		const outlineMesh = new THREE.InstancedMesh(hexGeo, outlineMat, gc.indices.length);
		for (let j = 0; j < gc.indices.length; j++) {
			const inst = instances[gc.indices[j]];
			dummy.position.copy(inst.position);
			dummy.rotation.copy(inst.rotation);
			dummy.scale.setScalar(inst.scale);
			dummy.updateMatrix();
			outlineMesh.setMatrixAt(j, dummy.matrix);
		}
		outlineMesh.instanceMatrix.needsUpdate = true;
		outlineMesh.frustumCulled = true;
		group.add(outlineMesh);
		meshes.push(outlineMesh);
	}

	return { group, meshes };
}

// ── Phase 2+: Build flying balls with trails ──

function mulberry32(a: number): () => number {
	let s = a | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function generateBallPath(seed: number): THREE.Vector3[] {
	const rng = mulberry32(seed);
	const pts: THREE.Vector3[] = [];
	const centerZ = -120;
	for (let i = 0; i < 8; i++) {
		const t = (i / 8) * Math.PI * 2;
		const x = Math.sin(t * 2.3 + seed) * 6 + (rng() - 0.5) * 3;
		const y = 3 + Math.sin(t * 1.7 + seed * 2) * 3 + (rng() - 0.5) * 2;
		const z = centerZ + Math.cos(t * 1.9 + seed * 0.5) * 50 + (rng() - 0.5) * 15;
		pts.push(new THREE.Vector3(x, y, z));
	}
	pts.push(pts[0].clone());
	return pts;
}

function buildBalls(): BallData[] {
	const data: BallData[] = [];
	const ballGeo = new THREE.SphereGeometry(0.25, 8, 8);
	const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

	for (let i = 0; i < BALL_COUNT; i++) {
		const path = generateBallPath(i * 100 + 42);
		const ball = new THREE.Mesh(ballGeo, ballMat);

		const tPositions = new Float32Array(TRAIL_POINTS * 3);
		const tColors = new Float32Array(TRAIL_POINTS * 3);

		const curve = new CatmullRomCurve3(path, true, "catmullrom", 0.5);
		const curvePoints = curve.getPoints(TRAIL_POINTS - 1);

		for (let j = 0; j < TRAIL_POINTS; j++) {
			const cp = curvePoints[j];
			tPositions[j * 3] = cp.x;
			tPositions[j * 3 + 1] = cp.y;
			tPositions[j * 3 + 2] = cp.z;
		}

		const trailGeo = new THREE.BufferGeometry();
		trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPositions, 3));
		trailGeo.setAttribute("color", new THREE.Float32BufferAttribute(tColors, 3));

		const trailMat = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.7,
		});
		const trail = new THREE.Line(trailGeo, trailMat);

		data.push({
			mesh: ball,
			trail,
			trailPositions: tPositions,
			trailColors: tColors,
			curve,
			pathIdx: Math.random(),
			speed: 0.15 + Math.random() * 0.25,
		});
	}
	return data;
}

// ── Flight spline + golden path ──

function buildFlightSpline(): CatmullRomCurve3 {
	const pts: THREE.Vector3[] = [];
	const segments = 20;
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const z = TUBE_NEAR_END - t * CANYON_LENGTH;
		const x = Math.sin(t * Math.PI * 3) * 4 + Math.sin(t * Math.PI * 0.7) * 2;
		const y = 2 + Math.sin(t * Math.PI * 2.5) * 1.5 + Math.sin(t * Math.PI * 0.5) * 0.8;
		pts.push(new THREE.Vector3(x, y, z));
	}
	return new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}

function buildGoldenPath(
	spline: CatmullRomCurve3,
	outlineMat: THREE.ShaderMaterial,
): { tube: THREE.Mesh; outline: THREE.Mesh } {
	const goldenPoints = spline.getPoints(200);
	const goldenCurve = new CatmullRomCurve3(goldenPoints, false);
	const tubeGeo = new TubeGeometry(goldenCurve, 100, 0.08, 6, false);
	const tubeMat = new THREE.MeshBasicMaterial({
		color: 0xffaa00,
		transparent: true,
		opacity: 0.85,
		blending: THREE.AdditiveBlending,
	});
	const tube = new THREE.Mesh(tubeGeo, tubeMat);
	tube.frustumCulled = false;

	const outlineTube = new THREE.Mesh(tubeGeo.clone(), outlineMat);
	outlineTube.frustumCulled = false;

	return { tube, outline: outlineTube };
}

// ── Phase 5: Leviathan worm ──

function buildLeviathan(ballPositions: Float32Array[]): THREE.Mesh | null {
	if (ballPositions.length === 0) return null;

	const wormPts: THREE.Vector3[] = [];
	for (let i = 0; i < TRAIL_POINTS; i++) {
		let sumX = 0;
		let sumY = 0;
		let sumZ = 0;
		let count = 0;
		for (const bp of ballPositions) {
			sumX += bp[i * 3];
			sumY += bp[i * 3 + 1];
			sumZ += bp[i * 3 + 2];
			count++;
		}
		wormPts.push(new THREE.Vector3(sumX / count, sumY / count, sumZ / count));
	}

	const wormCurve = new CatmullRomCurve3(wormPts, true, "catmullrom", 0.5);
	const wormGeo = new TubeGeometry(wormCurve, 64, 0.3, 8, true);
	const wormMat = new THREE.MeshBasicMaterial({
		color: 0x44aaff,
		transparent: true,
		opacity: 0.8,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
	});
	const worm = new THREE.Mesh(wormGeo, wormMat);

	const innerGeo = new TubeGeometry(wormCurve, 64, 0.1, 4, true);
	const innerMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.9,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
	});
	const inner = new THREE.Mesh(innerGeo, innerMat);
	worm.add(inner);

	return worm;
}

// ── Phase 6: Void sphere + split screen ──

function buildVoidSphere(): THREE.Mesh {
	const mat = createVoidSphereMaterial();
	const geo = new THREE.SphereGeometry(200, 32, 32);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.frustumCulled = false;
	return mesh;
}

function buildSplitScreenMesh(
	outlineMat: THREE.ShaderMaterial,
): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		transparent: true,
		uniforms: {
			uTime: { value: 0 },
			uPhaseProgress: { value: 0 },
		},
		vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
		fragmentShader: `
      uniform float uTime;
      uniform float uPhaseProgress;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        float splitLine = step(0.5, uv.x);

        // Left half: golden loop + closed door
        vec2 luv = uv * 2.0;
        luv.x -= 0.5;
        float circleDist = length(luv - vec2(0.5, 0.5));
        float circle = 1.0 - smoothstep(0.3, 0.35, circleDist);
        float glow = exp(-circleDist * 3.0) * 0.5;
        vec3 leftCol = vec3(0.05, 0.0, 0.05);
        leftCol += vec3(1.0, 0.7, 0.0) * circle;
        leftCol += vec3(1.0, 0.8, 0.2) * glow;

        // Door shape
        float door = 1.0 - smoothstep(0.2, 0.8, abs(luv.x - 0.5));
        door *= 1.0 - smoothstep(0.0, 0.6, abs(luv.y - 0.6));
        float doorGlow = door * 0.3;
        leftCol += vec3(0.2, 0.0, 0.1) * doorGlow;

        // Right half: dark + open doorway
        vec2 ruv = uv * 2.0 - vec2(1.0, 0.0);
        vec3 rightCol = vec3(0.0, 0.0, 0.02);
        float arch = 1.0 - smoothstep(0.15, 1.0, abs(ruv.x - 0.5));
        arch *= 1.0 - smoothstep(0.4, 0.8, abs(ruv.y - 0.5));
        float openGlow = arch * 0.2 * (0.5 + 0.5 * sin(uTime * 0.5 + ruv.y * 2.0));
        rightCol += vec3(0.1, 0.0, 0.2) * openGlow;

        // Overlay split line glow
        float splitGlow = exp(-abs(uv.x - 0.5) * 50.0) * 0.3;
        vec3 splitCol = vec3(0.3, 0.0, 0.5) * splitGlow;

        vec3 col = mix(leftCol, rightCol, splitLine) + splitCol;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
	});

	const geo = new THREE.PlaneGeometry(20, 20);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.position.set(0, 0, 5);
	mesh.frustumCulled = false;
	return mesh;
}

// ── State ──

export interface DesktopControls {
	keys: Set<string>;
	yaw: number;
	pitch: number;
	isLocked: boolean;
	ready: boolean;
	readyTimer: number;
}

export interface B2LesserState extends ExperienceState {
	elapsed: number;
	camera: THREE.PerspectiveCamera;
	scene: THREE.Scene | null;
	renderer: THREE.WebGLRenderer | null;

	tubeGroup: THREE.Group;
	canalMat: THREE.ShaderMaterial;
	fogMats: THREE.ShaderMaterial[];

	duneGroup: THREE.Group;
	terrainMesh: THREE.Mesh;
	duneMat: THREE.ShaderMaterial;
	terrainOutline: THREE.Mesh;
	outlineMat: THREE.ShaderMaterial;
	crystalGroup: THREE.Group;
	crystalMeshes: THREE.InstancedMesh[];
	balls: BallData[];

	skyGroup: THREE.Group;
	goldenPath: { tube: THREE.Mesh; outline: THREE.Mesh } | null;
	flightSpline: CatmullRomCurve3 | null;
	flightProgress: number;

	phase: number;
	phaseTime: number;

	voidReveal: number;
	vrStarted: boolean;
	warpStrength: number;
	shakeIntensity: number;

	leviathanMesh: THREE.Mesh | null;
	voidSphere: THREE.Mesh | null;
	splitScreenMesh: THREE.Mesh | null;

	composer: EffectComposer | null;
	bloomPass: BloomEffect | null;
	pipelineReady: boolean;

	fadeOverlay: THREE.Mesh;

	desktop: DesktopControls;

	removeListener: (() => void) | null;
}

// ── Setup ──

export async function setup(ctx: SetupContext): Promise<B2LesserState> {
	const renderer = ctx.renderer;
	renderer.xr.enabled = true;

	const scene = ctx.scene;
	scene.background = new THREE.Color(0x000000);

	// ── Shared outline material (inverted hull) ──
	const outlineMat = createOutlineMaterial();

	// ── Tube group (phase 1) ──
	const tubeGroup = new THREE.Group();
	const canalMat = createCanalMaterial();
	const canalMesh = buildCanal(canalMat);

	const texLoader = new THREE.TextureLoader();
	const diffuseTex = texLoader.load(meatDiffuseUrl);
	diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;
	diffuseTex.repeat.set(1, 1);
	canalMat.uniforms.uDiffuse.value = diffuseTex;

	tubeGroup.add(canalMesh);

	const fogMats: THREE.ShaderMaterial[] = [];
	const nebulaSystem = buildNebulaMist(fogMats);
	tubeGroup.add(nebulaSystem);

	scene.add(tubeGroup);

	// ── Dune group (phase 2-5) ──
	const duneGroup = new THREE.Group();

	const { mesh: terrainMesh, mat: duneMat, outline: terrainOutline } = buildTerrain(outlineMat);
	duneGroup.add(terrainMesh);
	duneGroup.add(terrainOutline);

	const { group: crystalGroup, meshes: crystalMeshes } = buildCrystalInstances(outlineMat);
	duneGroup.add(crystalGroup);

	const balls = buildBalls();
	for (const b of balls) {
		duneGroup.add(b.mesh);
		duneGroup.add(b.trail);
	}

	// Flight spline + golden path
	const flightSpline = buildFlightSpline();
	const goldenPath = buildGoldenPath(flightSpline, outlineMat);
	duneGroup.add(goldenPath.tube);
	duneGroup.add(goldenPath.outline);

	duneGroup.visible = false;
	scene.add(duneGroup);

	// ── Sky group (stars) ──
	const skyGroup = new THREE.Group();
	const stars = createStarField(2000);
	skyGroup.add(stars);
	skyGroup.visible = false;
	scene.add(skyGroup);

	// ── Phase 6 elements (pre-built, added when phase activates) ──
	const voidSphere = buildVoidSphere();
	voidSphere.visible = false;
	scene.add(voidSphere);

	const splitScreenMesh = buildSplitScreenMesh(outlineMat);
	splitScreenMesh.visible = false;
	scene.add(splitScreenMesh);

	// ── EffectComposer for non-XR bloom ──
	const composer = new EffectComposer(renderer);
	const renderPass = new RenderPass(scene, ctx.camera);
	composer.addPass(renderPass);

	const bloomEffect = new BloomEffect({
		intensity: 0.6,
		luminanceThreshold: 0.4,
		luminanceSmoothing: 0.2,
		mipmapBlur: true,
	});
	const effectPass = new EffectPass(ctx.camera, bloomEffect);
	composer.addPass(effectPass);

	composer.setSize(window.innerWidth, window.innerHeight);

	// ── Fade-in overlay ──
	const fadeGeo = new THREE.PlaneGeometry(2, 2);
	const fadeMat = new THREE.MeshBasicMaterial({
		color: 0x000000,
		transparent: true,
		opacity: 1,
		depthTest: false,
	});
	const fadeOverlay = new THREE.Mesh(fadeGeo, fadeMat);
	fadeOverlay.position.set(0, 0, -0.5);
	fadeOverlay.rotation.y = Math.PI;
	fadeOverlay.renderOrder = 999;
	ctx.camera.add(fadeOverlay);

	const state: B2LesserState = {
		elapsed: 0,
		camera: ctx.camera,
		scene,
		renderer,

		tubeGroup,
		canalMat,
		fogMats,

		duneGroup,
		terrainMesh,
		duneMat,
		terrainOutline,
		outlineMat,
		crystalGroup,
		crystalMeshes,
		balls,

		skyGroup,
		goldenPath,
		flightSpline,
		flightProgress: 0,

		phase: 1,
		phaseTime: 0,

		voidReveal: 0,
		vrStarted: false,
		warpStrength: 0,
		shakeIntensity: 0,

		leviathanMesh: null,
		voidSphere,
		splitScreenMesh,

		composer,
		bloomPass: bloomEffect,
		pipelineReady: true,

		fadeOverlay,

		desktop: {
			keys: new Set(),
			yaw: 0,
			pitch: 0,
			isLocked: false,
			ready: false,
			readyTimer: 0,
		},

		removeListener: null,
	};

	applyPhase(state, 1);

	// ── Phase switching (1-6) + Enter to start ──
	const onKey = (e: KeyboardEvent): void => {
		const k = e.key;
		const num = k.length === 1 ? parseInt(k) : parseInt(k.replace("Numpad", ""));
		if (!isNaN(num) && num >= 1 && num <= 6) {
			applyPhase(state, num);
		}
		if (e.key === "Enter" && !state.vrStarted) {
			state.vrStarted = true;
		}
	};
	document.addEventListener("keydown", onKey);

	const onKeyDown = (e: KeyboardEvent): void => {
		state.desktop.keys.add(e.key.toLowerCase());
	};
	const onKeyUp = (e: KeyboardEvent): void => {
		state.desktop.keys.delete(e.key.toLowerCase());
	};
	document.addEventListener("keydown", onKeyDown);
	document.addEventListener("keyup", onKeyUp);

	const onMouseMove = (e: MouseEvent): void => {
		if (state.desktop.isLocked) {
			state.desktop.yaw -= e.movementX * 0.002;
			state.desktop.pitch -= e.movementY * 0.002;
			state.desktop.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.desktop.pitch));
		}
	};
	const onLockChange = (): void => {
		state.desktop.isLocked = document.pointerLockElement === document.body;
	};
	document.addEventListener("mousemove", onMouseMove);
	document.addEventListener("pointerlockchange", onLockChange);

	const onTab = (e: KeyboardEvent): void => {
		if (e.key === "Tab" && state.desktop.ready) {
			e.preventDefault();
			if (document.pointerLockElement === document.body) {
				document.exitPointerLock();
			} else {
				document.body.requestPointerLock();
			}
		}
	};
	document.addEventListener("keydown", onTab);

	state.removeListener = () => {
		document.removeEventListener("keydown", onKey);
		document.removeEventListener("keydown", onKeyDown);
		document.removeEventListener("keyup", onKeyUp);
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("pointerlockchange", onLockChange);
		document.removeEventListener("keydown", onTab);
	};

	return state;
}

// ── Phase switching ──

function applyPhase(s: B2LesserState, phase: number): void {
	const prevPhase = s.phase;
	s.phase = phase;
	s.phaseTime = 0;
	s.camera.position.set(0, 0, TUBE_NEAR_END);
	s.camera.rotation.set(0, 0, 0);

	// Cleanup phase-specific objects
	if (s.splitScreenMesh) s.splitScreenMesh.visible = false;
	if (s.voidSphere) s.voidSphere.visible = false;

	if (s.leviathanMesh && phase !== 5) {
		s.duneGroup.remove(s.leviathanMesh);
		recursiveDispose(s.leviathanMesh);
		s.leviathanMesh = null;
	}

	// Show/hide golden path for phases 2-5
	if (s.goldenPath) {
		s.goldenPath.tube.visible = phase >= 2 && phase <= 5;
		s.goldenPath.outline.visible = phase >= 2 && phase <= 5;
	}

	const def = PHASES[phase - 1];

	if (def.type === "tunnel") {
		s.tubeGroup.visible = true;
		s.duneGroup.visible = false;
		s.skyGroup.visible = false;

		const p = def;
		s.canalMat.uniforms.uPeriStrength.value = p.periStrength;
		s.canalMat.uniforms.uColor1.value.setRGB(p.color1[0], p.color1[1], p.color1[2]);
		s.canalMat.uniforms.uColor2.value.setRGB(p.color2[0], p.color2[1], p.color2[2]);
		s.canalMat.uniforms.uColor3.value.setRGB(p.color3[0], p.color3[1], p.color3[2]);
		s.canalMat.uniforms.uPhase.value = (phase - 1) / 5;
		s.canalMat.uniforms.uNearEnd.value = TUBE_NEAR_END;
		s.canalMat.uniforms.uFarEnd.value = TUBE_FAR_END;
		s.canalMat.uniforms.uBright.value = p.bright;
		s.voidReveal = 0;
		s.canalMat.uniforms.uVoidReveal.value = 0;
	} else {
		s.tubeGroup.visible = false;

		if (phase === 6) {
			s.duneGroup.visible = false;
			s.skyGroup.visible = false;
			if (s.voidSphere) s.voidSphere.visible = true;
			if (s.splitScreenMesh) s.splitScreenMesh.visible = true;
			return;
		}

		s.duneGroup.visible = true;
		s.skyGroup.visible = true;

		const p = def;

		// Update terrain material uniforms
		s.duneMat.uniforms.uWarpStrength.value = p.warpStrength;
		s.duneMat.uniforms.uWarpMode.value = p.warpMode;
		s.duneMat.uniforms.uBright.value = p.bright;

		// Update crystals brightness
		for (const im of s.crystalMeshes) {
			if (im.material instanceof THREE.MeshToonMaterial) {
				im.material.emissiveIntensity = 0.1 + p.bright * 0.2;
			}
		}

		for (const b of s.balls) {
			b.speed = 0.15 + p.ballSpeed * 0.3;
		}

		// Phase 5: build leviathan
		if (phase === 5 && !s.leviathanMesh) {
			const ballPositions = s.balls.map((b) => b.trailPositions);
			const worm = buildLeviathan(ballPositions);
			if (worm) {
				s.leviathanMesh = worm;
				s.duneGroup.add(worm);
			}
		}
	}
}

function recursiveDispose(obj: THREE.Object3D): void {
	if (obj instanceof THREE.Mesh) {
		obj.geometry.dispose();
		if (Array.isArray(obj.material)) {
			obj.material.forEach((m) => m.dispose());
		} else {
			obj.material.dispose();
		}
	}
	for (const child of obj.children) {
		recursiveDispose(child);
	}
}

// ── Tick ──

export function tick(
	state: ExperienceState,
	ctx: TickContext,
): {
	state: ExperienceState;
	outputs?: Record<string, number>;
	render?: (delta: number) => void;
} {
	const s = state as B2LesserState;
	const delta = ctx.delta;

	s.elapsed += delta;
	s.phaseTime += delta;

	const fadeMat = s.fadeOverlay.material as THREE.MeshBasicMaterial;
	if (s.elapsed < FADE_IN_DURATION) {
		fadeMat.opacity = 1 - s.elapsed / FADE_IN_DURATION;
	} else {
		fadeMat.opacity = 0;
		s.fadeOverlay.visible = false;
	}

	const phase = s.phase;
	const def = PHASES[phase - 1];

	if (def.type === "tunnel") {
		tickTunnel(s, delta, def);
	} else if (phase === 6) {
		tickSplitScreen(s, delta);
	} else {
		tickDesert(s, delta, def);
	}

	if (phase === 5) {
		tickLeviathanDive(s, delta);
	}

	if (s.shakeIntensity > 0.001 && phase !== 6) {
		applyShake(s, delta);
	}

	if (!s.desktop.ready) {
		s.desktop.readyTimer += delta;
		if (s.desktop.readyTimer >= 2.0) {
			s.desktop.ready = true;
		}
	}

	if (s.desktop.ready && s.desktop.isLocked) {
		applyDesktopControls(s, delta);
	}

	// Return render callback for bloom (non-XR only)
	const isXR = s.renderer?.xr.isPresenting ?? false;
	if (!isXR && s.pipelineReady && s.composer && s.duneGroup.visible) {
		return {
			state: s,
			render: (_delta: number) => {
				s.composer!.render();
			},
		};
	}

	return { state: s };
}

// ── Tick sub-functions ──

function tickTunnel(s: B2LesserState, delta: number, def: TunnelPhaseDef): void {
	if (s.phaseTime < VOID_FADE_DURATION) {
		s.voidReveal = Math.min(1.0, s.phaseTime / VOID_FADE_DURATION);
	} else {
		s.voidReveal = 1.0;
	}
	s.canalMat.uniforms.uVoidReveal.value = s.voidReveal;

	for (const mat of s.fogMats) {
		mat.uniforms.uTime.value = s.elapsed;
	}

	s.canalMat.uniforms.uTime.value = s.elapsed;

	const periPulse = 0.8 + 0.2 * Math.sin(s.elapsed * 0.8);
	const p = def;
	if (s.phase === 2 || s.phase === 4) {
		s.canalMat.uniforms.uPeriStrength.value = p.periStrength * periPulse;
	}

	const shapePulse = 0.7 + 0.3 * Math.sin(s.elapsed * 0.5);
	s.canalMat.uniforms.uShapeZ.value = p.shapeDist;
	s.canalMat.uniforms.uShapeScale.value = p.shapeScale * (0.8 + 0.2 * shapePulse);

	let camZ: number;

	if (s.desktop.isLocked) {
		camZ = s.camera.position.z;
	} else {
		const pushWave = Math.sin(s.elapsed * 0.4) * 0.5 + 0.5;
		const step = (p.speed + p.pushAmp * pushWave) * delta;
		camZ = s.camera.position.z - step;
		camZ = Math.min(TUBE_NEAR_END, Math.max(TUBE_FAR_END, camZ));
		s.camera.position.z = camZ;
		s.camera.position.x = Math.sin(camZ * 0.015) * 2.0;
		s.camera.position.y = Math.cos(camZ * 0.01) * 1.2;
	}

	s.canalMat.uniforms.uLightZ.value = camZ - 30;
}

function tickDesert(s: B2LesserState, delta: number, def: DunePhaseDef): void {
	// Update terrain material uniforms
	const targetWarp = def.warpStrength;
	s.warpStrength += (targetWarp - s.warpStrength) * delta * 2;
	s.shakeIntensity += (def.shakeMag - s.shakeIntensity) * delta * 2;

	s.duneMat.uniforms.uTime.value = s.elapsed;
	s.duneMat.uniforms.uWarpStrength.value = s.warpStrength;
	s.duneMat.uniforms.uWarpMode.value = def.warpMode;
	s.duneMat.uniforms.uWarpCenter.value = new THREE.Vector3(
		Math.sin(s.elapsed * 0.1) * 3,
		-2,
		s.camera.position.z - 50,
	);
	s.duneMat.uniforms.uBright.value = def.bright;

	// Camera auto-scroll along Z + gentle bending (same as original)
	const pushWave = Math.sin(s.elapsed * 0.4) * 0.5 + 0.5;
	const step = (def.speed + def.pushAmp * pushWave) * delta;
	s.camera.position.z -= step;
	s.camera.position.z = Math.min(TUBE_NEAR_END, Math.max(TUBE_FAR_END, s.camera.position.z));

	const camZ = s.camera.position.z;
	const bend = Math.sin(camZ * 0.008) * 1.5;
	s.camera.position.x = bend;
	s.camera.position.y = 2.0 + Math.sin(camZ * 0.006) * 0.5;
	s.camera.rotation.x = 0;
	s.camera.rotation.y = 0;
	s.camera.rotation.z = 0;

	// Crystal rotation (update instance matrices for a subset via dummy)
	const rotSpeed = 0.3 + def.crystalSpeed * 0.5;
	const dummy = new THREE.Object3D();
	for (const im of s.crystalMeshes) {
		if (!(im.material instanceof THREE.MeshToonMaterial)) continue;
		const count = im.count;
		for (let j = 0; j < count; j++) {
			im.getMatrixAt(j, dummy.matrix);
			dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
			dummy.rotation.x += delta * rotSpeed * (0.5 + (j % 3) * 0.3);
			dummy.rotation.y += delta * rotSpeed * (0.7 + (j % 5) * 0.2);
			dummy.updateMatrix();
			im.setMatrixAt(j, dummy.matrix);
		}
		im.instanceMatrix.needsUpdate = true;
	}

	if (s.goldenPath) {
		const gp = s.goldenPath;
		const pulse = 0.6 + 0.4 * Math.sin(s.elapsed * 0.5);
		(gp.tube.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.4;
	}

	// Update balls + trails (camZ already declared above)
	const ballSpeedMult = def.ballSpeed * 0.5 + 0.3;
	const camOffset = camZ + 120;

	for (const b of s.balls) {
		b.pathIdx += delta * b.speed * ballSpeedMult;
		if (b.pathIdx >= 1) b.pathIdx -= 1;

		const pos = b.curve.getPoint(b.pathIdx);
		b.mesh.position.set(pos.x, pos.y, pos.z + camOffset);

		const trailPos = b.trail.geometry.attributes.position.array as Float32Array;
		for (let j = 0; j < TRAIL_POINTS; j++) {
			trailPos[j * 3] = b.trailPositions[j * 3];
			trailPos[j * 3 + 1] = b.trailPositions[j * 3 + 1];
			trailPos[j * 3 + 2] = b.trailPositions[j * 3 + 2] + camOffset;
		}
		b.trail.geometry.attributes.position.needsUpdate = true;

		const ballIdx = Math.floor(b.pathIdx * TRAIL_POINTS);
		const colors = b.trailColors;
		for (let j = 0; j < TRAIL_POINTS; j++) {
			const fwdDist =
				((ballIdx - j) % TRAIL_POINTS + TRAIL_POINTS) % TRAIL_POINTS;
			const ahead = fwdDist <= HALF_TRAIL;
			if (ahead) {
				colors[j * 3] = 1.0;
				colors[j * 3 + 1] = 0.1 + 0.15 * Math.sin(s.elapsed * 0.3 + j * 0.1);
				colors[j * 3 + 2] = 0.1 + 0.1 * Math.sin(s.elapsed * 0.4 + j * 0.1);
			} else {
				colors[j * 3] = 0.1 + 0.1 * Math.sin(s.elapsed * 0.3 + j * 0.1);
				colors[j * 3 + 1] = 0.4 + 0.2 * Math.sin(s.elapsed * 0.3 + j * 0.1);
				colors[j * 3 + 2] = 1.0;
			}
		}
		b.trail.geometry.attributes.color.needsUpdate = true;
	}
}

function tickLeviathanDive(s: B2LesserState, delta: number): void {
	const diveTime = s.phaseTime;
	const diveProgress = Math.min(1.0, diveTime / 3.0);

	const pitchTarget = Math.PI / 2;
	s.camera.rotation.x = pitchTarget * easeInCubic(diveProgress);

	const speedFade = 1.0 - diveProgress;
	const step = 5 * speedFade * delta;
	s.camera.position.z -= step;
	s.camera.position.y -= diveProgress * delta * 3;

	const wellCenter = new THREE.Vector3(0, -5 - diveProgress * 20, s.camera.position.z - 20);

	s.duneMat.uniforms.uWarpStrength.value = 3 + diveProgress * 5;
	s.duneMat.uniforms.uWarpCenter.value = wellCenter;

	s.shakeIntensity = 0.05 + diveProgress * 0.2;

	if (s.leviathanMesh) {
		const worm = s.leviathanMesh;
		worm.position.y -= diveProgress * delta * 2;
		worm.rotation.x += delta * 0.5;
		worm.rotation.z += delta * 0.3;
	}
}

function tickSplitScreen(s: B2LesserState, delta: number): void {
	if (s.splitScreenMesh) {
		const mat = s.splitScreenMesh.material as THREE.ShaderMaterial;
		mat.uniforms.uTime.value = s.elapsed;
		mat.uniforms.uPhaseProgress.value = Math.min(1.0, s.phaseTime / 2.0);
	}
	if (s.voidSphere) {
		const mat = s.voidSphere.material as THREE.ShaderMaterial;
		mat.uniforms.uTime.value = s.elapsed;
	}

	s.camera.position.set(0, 0, 10);
	s.camera.rotation.set(0, 0, 0);
}

function applyShake(s: B2LesserState, delta: number): void {
	const mag = s.shakeIntensity;
	if (mag < 0.001) return;

	const t = s.elapsed;
	s.camera.position.x += Math.sin(t * 50 + 1) * mag * 0.15;
	s.camera.position.y += Math.cos(t * 47 + 2) * mag * 0.15;
	s.camera.position.z += Math.sin(t * 53 + 3) * mag * 0.05;
	s.camera.rotation.z += Math.sin(t * 43 + 4) * mag * 0.02;
}

function easeInCubic(t: number): number {
	return t * t * t;
}

function applyDesktopControls(s: B2LesserState, delta: number): void {
	const keys = s.desktop.keys;
	const yaw = s.desktop.yaw;
	const pitch = s.desktop.pitch;

	s.camera.rotation.y = yaw;
	s.camera.rotation.x = pitch;

	const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
	const right = new THREE.Vector3(forward.z, 0, -forward.x);

	const moveSpeed = 10 * delta;
	const move = new THREE.Vector3(0, 0, 0);

	if (keys.has("w")) move.add(forward.clone().multiplyScalar(moveSpeed));
	if (keys.has("s")) move.add(forward.clone().multiplyScalar(-moveSpeed));
	if (keys.has("a")) move.add(right.clone().multiplyScalar(-moveSpeed));
	if (keys.has("d")) move.add(right.clone().multiplyScalar(moveSpeed));

	s.camera.position.add(move);
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
	const s = state as B2LesserState;
	s.removeListener?.();

	s.fadeOverlay.geometry.dispose();
	(s.fadeOverlay.material as THREE.Material).dispose();
	s.camera.remove(s.fadeOverlay);

	s.canalMat.dispose();
	s.fogMats.forEach((m) => m.dispose());
	s.outlineMat.dispose();

	// Dispose terrain
	s.terrainMesh.geometry.dispose();
	if (Array.isArray(s.terrainMesh.material)) {
		s.terrainMesh.material.forEach((m) => m.dispose());
	} else {
		s.terrainMesh.material.dispose();
	}
	s.terrainOutline.geometry.dispose();

	// Dispose crystals (InstancedMesh)
	for (const im of s.crystalMeshes) {
		im.geometry.dispose();
		if (Array.isArray(im.material)) {
			im.material.forEach((m) => m.dispose());
		} else {
			im.material.dispose();
		}
	}

	for (const b of s.balls) {
		b.mesh.geometry.dispose();
		(b.mesh.material as THREE.Material).dispose();
		b.trail.geometry.dispose();
		(b.trail.material as THREE.Material).dispose();
	}

	// Golden path
	if (s.goldenPath) {
		s.goldenPath.tube.geometry.dispose();
		if (Array.isArray(s.goldenPath.tube.material)) {
			s.goldenPath.tube.material.forEach((m) => m.dispose());
		} else {
			(s.goldenPath.tube.material as THREE.Material).dispose();
		}
		s.goldenPath.outline.geometry.dispose();
	}

	if (s.leviathanMesh) recursiveDispose(s.leviathanMesh);

	if (s.voidSphere) {
		s.voidSphere.geometry.dispose();
		if (Array.isArray(s.voidSphere.material)) {
			s.voidSphere.material.forEach((m) => m.dispose());
		} else {
			(s.voidSphere.material as THREE.Material).dispose();
		}
	}
	if (s.splitScreenMesh) {
		s.splitScreenMesh.geometry.dispose();
		if (Array.isArray(s.splitScreenMesh.material)) {
			s.splitScreenMesh.material.forEach((m) => m.dispose());
		} else {
			(s.splitScreenMesh.material as THREE.Material).dispose();
		}
	}

	// Dispose EffectComposer
	if (s.composer) {
		s.composer.dispose();
	}
}
