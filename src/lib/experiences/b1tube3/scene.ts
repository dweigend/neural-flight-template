import * as THREE from "three";
import { LineCurve3, TubeGeometry } from "three";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { createCanalMaterial, createGlowShapeMaterial } from "./shaders";
import meatDiffuseUrl from "./textures/Ground Beef/Meat 001_diffuse.png";

// ── Constants ──
const TUBE_RADIUS = 3.5;
const TUBE_LENGTH = 500;
const TUBE_NEAR_END = 10;
const TUBE_FAR_END = -(TUBE_LENGTH - 10);
const TUBE_RAD_SEG = 32;
const TUBE_Z_SEG = 100;
const STAR_COUNT = 4000;
const LIGHT_BALL_COUNT = 50;

// ── Phase definitions ──
interface PhaseDef {
	speed: number;
	periStrength: number;
	pushAmp: number;
	touchAmp: number;
	shapeDist: number;
	shapeScale: number;
	particleBright: number;
	color1: [number, number, number];
	color2: [number, number, number];
	color3: [number, number, number];
	fogColor: [number, number, number];
}

const PHASES: PhaseDef[] = [
	// 1 - Birth Canal: fleshy, pumping, solid walls
	{
		speed: 3, periStrength: 8.0, pushAmp: 2, touchAmp: 0.02, shapeDist: -200, shapeScale: 0.3,
		particleBright: 0.7,
		color1: [0.20, 0.02, 0.05], color2: [0.12, 0.01, 0.03], color3: [0.30, 0.04, 0.10],
		fogColor: [0.06, 0.01, 0.02],
	},
	// 2 - Contraction: cosmic squeeze, galaxy colors
	{
		speed: 5, periStrength: 6.0, pushAmp: 5, touchAmp: 0.03, shapeDist: -180, shapeScale: 0.4,
		particleBright: 0.9,
		color1: [0.16, 0.02, 0.09], color2: [0.07, 0.01, 0.04], color3: [0.25, 0.05, 0.14],
		fogColor: [0.05, 0.01, 0.03],
	},
	// 3 - Expansion: nebula blooming
	{
		speed: 8, periStrength: 4.0, pushAmp: 7, touchAmp: 0.03, shapeDist: -160, shapeScale: 0.5,
		particleBright: 1.0,
		color1: [0.22, 0.07, 0.15], color2: [0.10, 0.02, 0.05], color3: [0.32, 0.12, 0.20],
		fogColor: [0.09, 0.02, 0.04],
	},
	// 4 - Extraction: intense pink/purple pull
	{
		speed: 14, periStrength: 5.0, pushAmp: 12, touchAmp: 0.04, shapeDist: -140, shapeScale: 0.6,
		particleBright: 1.2,
		color1: [0.30, 0.05, 0.16], color2: [0.18, 0.02, 0.07], color3: [0.40, 0.10, 0.22],
		fogColor: [0.12, 0.02, 0.05],
	},
	// 5 - Emergence: bright magenta portal
	{
		speed: 18, periStrength: 2.0, pushAmp: 10, touchAmp: 0.02, shapeDist: -80, shapeScale: 1.0,
		particleBright: 1.5,
		color1: [0.35, 0.09, 0.20], color2: [0.22, 0.04, 0.10], color3: [0.45, 0.15, 0.28],
		fogColor: [0.18, 0.04, 0.09],
	},
	// 6 - Escaped: intense magenta liberation
	{
		speed: 25, periStrength: 0.0, pushAmp: 0, touchAmp: 0.0, shapeDist: -30, shapeScale: 2.5,
		particleBright: 1.8,
		color1: [0.40, 0.15, 0.28], color2: [0.30, 0.05, 0.15], color3: [0.50, 0.22, 0.38],
		fogColor: [0.28, 0.10, 0.18],
	},
];

// ── Straight tube ──
function buildCanal(material: THREE.ShaderMaterial): THREE.Mesh {
	const path = new LineCurve3(
		new THREE.Vector3(0, 0, TUBE_NEAR_END),
		new THREE.Vector3(0, 0, TUBE_FAR_END),
	);
	const geo = new TubeGeometry(path, TUBE_Z_SEG, TUBE_RADIUS, TUBE_RAD_SEG, false);
	return new THREE.Mesh(geo, material);
}

// ── Stars (bright sparkles) ──
function createStars(): { points: THREE.Points; mat: THREE.ShaderMaterial } {
	const count = STAR_COUNT;
	const positions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const speeds = new Float32Array(count);
	const colors = new Float32Array(count * 3);

	for (let i = 0; i < count; i++) {
		const angle = Math.random() * Math.PI * 2;
		const radius = 0.5 + Math.random() * (TUBE_RADIUS - 0.5);
		const z = 5 - Math.random() * (TUBE_LENGTH + 20);
		positions[i * 3] = Math.cos(angle) * radius;
		positions[i * 3 + 1] = Math.sin(angle) * radius;
		positions[i * 3 + 2] = z;
		sizes[i] = 0.04 + Math.random() * 0.12;
		speeds[i] = 0.2 + Math.random() * 0.8;

		const tint = Math.random();
		if (tint < 0.33) {
			colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.2; colors[i * 3 + 2] = 0.5;
		} else if (tint < 0.66) {
			colors[i * 3] = 0.4; colors[i * 3 + 1] = 0.3; colors[i * 3 + 2] = 0.9;
		} else {
			colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.6;
		}
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
	geo.setAttribute("speed", new THREE.Float32BufferAttribute(speeds, 1));
	geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uBright: { value: 1.0 } },
		vertexShader: `
			attribute float size;
			attribute float speed;
			attribute vec3 color;
			uniform float uTime;
			uniform float uBright;
			varying float vAlpha;
			varying vec3 vCol;
			void main() {
				vec3 pos = position;
				float twinkle = 0.5 + 0.5 * sin(uTime * speed * 2.0 + pos.x * 10.0 + pos.y * 7.0);
				vAlpha = twinkle * uBright;
				vCol = color;
				vec4 mv = modelViewMatrix * vec4(pos, 1.0);
				gl_PointSize = size * (300.0 / -mv.z);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: `
			varying float vAlpha;
			varying vec3 vCol;
			void main() {
				float d = distance(gl_PointCoord, vec2(0.5));
				if (d > 0.5) discard;
				float glow = exp(-d * d * 10.0);
				gl_FragColor = vec4(vCol * 1.5, glow * vAlpha * 1.2);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	return { points: new THREE.Points(geo, mat), mat };
}

// ── Light balls (real 3D sphere light sources) ──
function createLightBalls(): { group: THREE.Group; mats: THREE.ShaderMaterial[] } {
	const count = LIGHT_BALL_COUNT;
	const group = new THREE.Group();
	const mats: THREE.ShaderMaterial[] = [];

	const geo = new THREE.SphereGeometry(1, 12, 12);

	for (let i = 0; i < count; i++) {
		const angle = Math.random() * Math.PI * 2;
		const radius = 0.6 + Math.random() * (TUBE_RADIUS - 1.0);
		const z = 5 - Math.random() * (TUBE_LENGTH + 20);

		const tint = Math.random();
		let r: number, g: number, b: number;
		if (tint < 0.33) {
			r = 1.0; g = 0.15; b = 0.3;
		} else if (tint < 0.66) {
			r = 0.9; g = 0.2; b = 0.9;
		} else {
			r = 0.6; g = 0.1; b = 0.7;
		}

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uColor: { value: new THREE.Color(r, g, b) },
				uBright: { value: 1.0 },
			},
			vertexShader: `
				varying vec3 vNormal;
				varying vec3 vViewPos;
				void main() {
					vNormal = normalize(normalMatrix * normal);
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					vViewPos = -mv.xyz;
					gl_Position = projectionMatrix * mv;
				}
			`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform float uTime;
				uniform float uBright;
				varying vec3 vNormal;
				varying vec3 vViewPos;
				void main() {
					vec3 N = normalize(vNormal);
					vec3 V = normalize(vViewPos);
					float rim = pow(1.0 - max(dot(V, N), 0.0), 3.0);
					float core = max(dot(V, N), 0.0);
					float glow = core * 0.3 + rim * 2.0;
					float pulse = 0.8 + 0.2 * sin(uTime * 0.5 + vViewPos.z * 0.3);
					float alpha = glow * 0.9 * uBright * pulse;
					if (alpha < 0.01) discard;
					gl_FragColor = vec4(uColor * glow * 2.0 * uBright, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		mats.push(mat);

		const scale = 0.1 + Math.random() * 0.2;
		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
		mesh.scale.set(scale, scale, scale);
		group.add(mesh);
	}

	return { group, mats };
}

// ── Glow shapes ──
function buildShape(shape: THREE.Shape, mat: THREE.ShaderMaterial, layer: number): THREE.Mesh {
	const geo = new THREE.ShapeGeometry(shape);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.layers.set(layer);
	return mesh;
}

// ── State ──
export interface B1LesserState extends ExperienceState {
	elapsed: number;
	camera: THREE.PerspectiveCamera;
	scene: THREE.Scene | null;
	renderer: THREE.WebGLRenderer | null;
	sceneObjects: {
		canal: THREE.Mesh;
		canalMat: THREE.ShaderMaterial;
		circleMat: THREE.ShaderMaterial;
		circleMesh: THREE.Mesh;
		triangleMat: THREE.ShaderMaterial;
		triangleMesh: THREE.Mesh;
		stars: THREE.Points;
		starMat: THREE.ShaderMaterial;
		lightGroup: THREE.Group;
		lightMats: THREE.ShaderMaterial[];
	} | null;
	phase: number;
	phaseTime: number;
	touchPhase: number;
	removeListener: (() => void) | null;
}

// ── Setup ──
export async function setup(ctx: SetupContext): Promise<B1LesserState> {
	const renderer = ctx.renderer;
	renderer.xr.enabled = true;
	ctx.scene.background = new THREE.Color(0x000000);

	const canalMat = createCanalMaterial();
	const canalMesh = buildCanal(canalMat);

	// Load meat texture
	const texLoader = new THREE.TextureLoader();
	const diffuseTex = texLoader.load(meatDiffuseUrl);
	diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;
	diffuseTex.repeat.set(1, 1);
	canalMat.uniforms.uDiffuse.value = diffuseTex;

	const { points: stars, mat: starMat } = createStars();

	const { group: lightGroup, mats: lightMats } = createLightBalls();
	ctx.scene.add(lightGroup);

	let circleMesh: THREE.Mesh;
	let triangleMesh: THREE.Mesh;

	// Circle — left eye (layer 1)
	const circleMat = createGlowShapeMaterial("#ff4488");
	const circleShape = new THREE.Shape();
	const cr = 1.0;
	const cSegs = 32;
	circleShape.moveTo(cr, 0);
	for (let i = 1; i <= cSegs; i++) {
		const a = (i / cSegs) * Math.PI * 2;
		circleShape.lineTo(Math.cos(a) * cr, Math.sin(a) * cr);
	}
	circleMesh = buildShape(circleShape, circleMat, 1);
	circleMesh.position.set(0, 0, -200);
	circleMesh.scale.set(0.3, 0.3, 1);
	ctx.scene.add(circleMesh);

	// Triangle — right eye (layer 2)
	const triangleMat = createGlowShapeMaterial("#44ff88");
	const triShape = new THREE.Shape();
	const tr = 1.0;
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
		const x = Math.cos(a) * tr;
		const y = Math.sin(a) * tr;
		if (i === 0) triShape.moveTo(x, y);
		else triShape.lineTo(x, y);
	}
	triShape.closePath();
	triangleMesh = buildShape(triShape, triangleMat, 2);
	triangleMesh.position.set(0, 0, -200);
	triangleMesh.scale.set(0.3, 0.3, 1);
	ctx.scene.add(triangleMesh);

	ctx.camera.position.set(0, 0, TUBE_NEAR_END);

	ctx.scene.add(canalMesh);
	ctx.scene.add(stars);
	// lightGroup already added above

	const state: B1LesserState = {
		elapsed: 0,
		camera: ctx.camera,
		scene: ctx.scene,
		renderer,
		sceneObjects: {
			canal: canalMesh,
			canalMat,
			circleMat,
			circleMesh,
			triangleMat,
			triangleMesh,
			stars,
			starMat,
			lightGroup,
			lightMats,
		},
		phase: 1,
		phaseTime: 0,
		touchPhase: 0,
		removeListener: null,
	};
	// Apply Phase 1 on startup
	applyPhase(state, 1);

	// Keyboard listener for phase skipping
	const onKey = (e: KeyboardEvent): void => {
		const num = parseInt(e.key);
		if (num >= 1 && num <= 6) {
			applyPhase(state, num);
		}
	};
	document.addEventListener("keydown", onKey);
	state.removeListener = () => document.removeEventListener("keydown", onKey);

	return state;
}

function applyPhase(s: B1LesserState, phase: number): void {
	s.phase = phase;
	s.phaseTime = 0;
	const p = PHASES[phase - 1];
	const o = s.sceneObjects;
	if (!o) return;

	o.canalMat.uniforms.uPeriStrength.value = p.periStrength;
	o.canalMat.uniforms.uColor1.value.setRGB(p.color1[0], p.color1[1], p.color1[2]);
	o.canalMat.uniforms.uColor2.value.setRGB(p.color2[0], p.color2[1], p.color2[2]);
	o.canalMat.uniforms.uColor3.value.setRGB(p.color3[0], p.color3[1], p.color3[2]);
	o.canalMat.uniforms.uPhase.value = (phase - 1) / 5;
	o.canalMat.uniforms.uNearEnd.value = TUBE_NEAR_END;
	o.canalMat.uniforms.uFarEnd.value = TUBE_FAR_END;

	o.starMat.uniforms.uBright.value = p.particleBright;

	for (const m of o.lightMats) {
		m.uniforms.uBright.value = p.particleBright;
	}
}

// ── Tick ──
export function tick(
	state: ExperienceState,
	ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
	const s = state as B1LesserState;
	s.elapsed += ctx.delta;
	s.phaseTime += ctx.delta;

	const o = s.sceneObjects;
	if (!o) return { state: s };

	const phase = s.phase;
	const p = PHASES[phase - 1];

	o.canalMat.uniforms.uTime.value = s.elapsed;

	const periPulse = 0.8 + 0.2 * Math.sin(s.elapsed * 0.8);
	if (phase === 2 || phase === 4) {
		o.canalMat.uniforms.uPeriStrength.value = p.periStrength * periPulse;
	}

	// Glow shapes
	const shapePulse = 0.7 + 0.3 * Math.sin(s.elapsed * 0.5);
	o.circleMat.uniforms.uTime.value = s.elapsed;
	o.triangleMat.uniforms.uTime.value = s.elapsed;

	// Move shapes closer/farther based on phase
	const shapeZ = p.shapeDist;
	const shapeScale = p.shapeScale * (0.8 + 0.2 * shapePulse);
	o.circleMesh.position.z = shapeZ;
	o.triangleMesh.position.z = shapeZ;
	o.circleMesh.scale.set(shapeScale, shapeScale, 1);
	o.triangleMesh.scale.set(shapeScale, shapeScale, 1);

	// Stars
	o.starMat.uniforms.uTime.value = s.elapsed;

	// Light balls
	for (const m of o.lightMats) {
		m.uniforms.uTime.value = s.elapsed;
	}

	// Push along tube
	const pushWave = Math.sin(s.elapsed * 0.4) * 0.5 + 0.5;
	const baseSpeed = p.speed;
	const pushBonus = p.pushAmp * pushWave;
	const step = (baseSpeed + pushBonus) * ctx.delta;
	s.camera.position.z -= step;

	// Clamp camera inside tube
	const z = s.camera.position.z;
	const n = TUBE_NEAR_END;
	const f = TUBE_FAR_END;
	s.camera.position.z = Math.min(n, Math.max(f, z));

	// Follow tube bend (same formula as vertex shader)
	const camZ = s.camera.position.z;
	s.camera.position.x = Math.sin(camZ * 0.015) * 2.0;
	s.camera.position.y = Math.cos(camZ * 0.01) * 1.2;

	// Moving light travels along tube, ahead of camera
	const lightZ = camZ - 30;
	o.canalMat.uniforms.uLightZ.value = lightZ;

	return { state: s };
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
	const o = s.sceneObjects;
	if (!o) return;
	o.canal.geometry.dispose();
	o.canalMat.dispose();
	o.circleMat.dispose();
	o.triangleMat.dispose();
	o.stars.geometry.dispose();
	o.starMat.dispose();
	for (const m of o.lightMats) m.dispose();
	if (o.lightGroup.children[0] instanceof THREE.Mesh) {
		o.lightGroup.children[0].geometry.dispose();
	}
}
