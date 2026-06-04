import * as THREE from "three";
import { LineCurve3 } from "three";
import {
	BloomEffect,
	Effect,
	EffectComposer,
	EffectPass,
	RenderPass,
} from "postprocessing";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { createCanalMaterial } from "./shaders";

// @ts-ignore
import tunnelVert from "./shaders/tunnel.vert?raw";
// @ts-ignore
import tunnelFrag from "./shaders/tunnel.frag?raw";
// @ts-ignore
import tunnelHaloVert from "./shaders/tunnel-halo.vert?raw";
// @ts-ignore
import tunnelHaloFrag from "./shaders/tunnel-halo.frag?raw";
// @ts-ignore
import frVert from "./shaders/fr.vert?raw";
// @ts-ignore
import cageFrag from "./shaders/cage.frag?raw";
// @ts-ignore
import glowFrag from "./shaders/glow.frag?raw";
// @ts-ignore
import particleVert from "./shaders/particle.vert?raw";
// @ts-ignore
import particleFrag from "./shaders/particle.frag?raw";
// @ts-ignore
import starVert from "./shaders/star.vert?raw";
// @ts-ignore
import starFrag from "./shaders/star.frag?raw";
// @ts-ignore
import postFrag from "./shaders/post.frag?raw";

import meatDiffuseUrl from "./textures/Ground Beef/Meat 001_diffuse.png";

class B5LesserEffect extends Effect {
	constructor() {
		super("B5LesserEffect", postFrag, {
			uniforms: new Map<string, THREE.Uniform<number>>([
				["uCA", new THREE.Uniform(0.14)],
				["uWarp", new THREE.Uniform(0.0)],
				["uVig", new THREE.Uniform(0.65)],
				["uFlicker", new THREE.Uniform(0.0)],
				["uHeartbeat", new THREE.Uniform(0.0)],
				["uTime", new THREE.Uniform(0.0)],
			]),
		});
	}

	setCA(v: number): void { (this.uniforms.get("uCA") as THREE.Uniform<number>).value = v; }
	setWarp(v: number): void { (this.uniforms.get("uWarp") as THREE.Uniform<number>).value = v; }
	setVig(v: number): void { (this.uniforms.get("uVig") as THREE.Uniform<number>).value = v; }
	setFlicker(v: number): void { (this.uniforms.get("uFlicker") as THREE.Uniform<number>).value = v; }
	setHeartbeat(v: number): void { (this.uniforms.get("uHeartbeat") as THREE.Uniform<number>).value = v; }
	setTime(v: number): void { (this.uniforms.get("uTime") as THREE.Uniform<number>).value = v; }
}

function createCylGeo(r: number, len: number, segs: number, rings: number): THREE.BufferGeometry {
	const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
	for (let i = 0; i <= rings; i++) {
		const z = -(i / rings) * len;
		for (let j = 0; j <= segs; j++) {
			const a = (j / segs) * Math.PI * 2;
			pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
			nrm.push(Math.cos(a), Math.sin(a), 0);
			uv.push(j / segs, i / rings);
		}
	}
	for (let i = 0; i < rings; i++) {
		for (let j = 0; j < segs; j++) {
			const a = i * (segs + 1) + j, b = a + segs + 1, c = a + 1, d = b + 1;
			idx.push(a, b, c, c, b, d);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	return g;
}

function createStarField(count: number, rMin: number, rMax: number, lenZ: number, colorFn: (r: number) => [number, number, number], szRange: [number, number]): THREE.Points {
	const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
		pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = -50 + Math.random() * (lenZ + 100);
		const c = colorFn(Math.random());
		col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
		sz[i] = szRange[0] + Math.random() * szRange[1]; ph[i] = Math.random() * Math.PI * 2;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
	geo.setAttribute("aSz", new THREE.Float32BufferAttribute(sz, 1));
	geo.setAttribute("aPh", new THREE.Float32BufferAttribute(ph, 1));

	const mat = new THREE.ShaderMaterial({
		vertexShader: starVert, fragmentShader: starFrag,
		uniforms: { uTime: { value: 0 } },
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
	});
	const pts = new THREE.Points(geo, mat);
	pts.visible = false;
	return pts;
}

function buildCanal(material: THREE.ShaderMaterial): THREE.Mesh {
	const path = new LineCurve3(
		new THREE.Vector3(0, 0, CANAL_NEAR),
		new THREE.Vector3(0, 0, CANAL_FAR),
	);
	const geo = new THREE.TubeGeometry(path, CANAL_Z_SEG, CANAL_RADIUS, CANAL_RAD_SEG, false);
	return new THREE.Mesh(geo, material);
}

const TRAIL_N = 10;
const HIST = 72;
const FUT = 36;

class TrailObject {
	readonly i: number;
	private hist: THREE.Vector3[] = [];
	private readonly ph: number;
	private readonly rad: number;
	private readonly frq: number;
	private readonly vz: number;
	readonly off: number;

	readonly dot: THREE.Mesh;
	readonly pPts: THREE.Points;
	readonly fPts: THREE.Points;
	private readonly _pp: Float32Array; private readonly _pc: Float32Array; private readonly _ps: Float32Array;
	private readonly _fp: Float32Array; private readonly _fc: Float32Array; private readonly _fs: Float32Array;

	constructor(i: number) {
		this.i = i;
		this.ph = (i / TRAIL_N) * Math.PI * 2 + Math.random();
		this.rad = 1.8 + Math.random() * 3.5;
		this.frq = 0.28 + Math.random() * 0.85;
		this.vz = (Math.random() - 0.25) * 0.35;
		this.off = 9 + i * 13;

		this.dot = new THREE.Mesh(
			new THREE.SphereGeometry(0.32, 10, 8),
			new THREE.ShaderMaterial({
				vertexShader: frVert, fragmentShader: glowFrag,
				uniforms: { uCol: { value: new THREE.Color(0.95, 0.92, 0.88) }, uPulse: { value: 1.0 } },
				transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
			}),
		);
		this.dot.visible = false;

		const mkPts = (n: number) => {
			const p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
			const geo = new THREE.BufferGeometry();
			geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
			geo.setAttribute("aCol", new THREE.BufferAttribute(c, 3));
			geo.setAttribute("aSz", new THREE.BufferAttribute(s, 1));
			const m = new THREE.Points(geo, new THREE.ShaderMaterial({
				vertexShader: particleVert, fragmentShader: particleFrag,
				transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
			}));
			m.visible = false;
			return { m, p, c, s };
		};

		const pp = mkPts(HIST); this.pPts = pp.m; this._pp = pp.p; this._pc = pp.c; this._ps = pp.s;
		const fp = mkPts(FUT); this.fPts = fp.m; this._fp = fp.p; this._fc = fp.c; this._fs = fp.s;
	}

	pos(t: number, camZ: number, leviathanMerge: number = 0): THREE.Vector3 {
		const z = camZ + this.off + Math.sin(t * 0.3 + this.ph) * 4.0 + this.vz * t;
		const a = t * this.frq + this.ph;
		const r = this.rad + Math.sin(t * 0.55 + this.ph) * 2.2;
		const normalPos = new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 1.23) * r * 0.75, z);

		if (leviathanMerge > 0) {
			const maw = new THREE.Vector3(Math.sin(t * 5 + this.ph) * 0.5, -4, camZ + 35);
			normalPos.lerp(maw, leviathanMerge);
		}
		return normalPos;
	}

	update(t: number, camZ: number, show: boolean, sc: number, leviathanMerge: number = 0): void {
		const p = this.pos(t, camZ, leviathanMerge);
		this.dot.position.copy(p);
		this.dot.visible = true;
		this.hist.push(p.clone());
		if (this.hist.length > HIST) this.hist.shift();

		const vis = show && this.hist.length > 3;
		this.pPts.visible = vis;
		this.fPts.visible = vis;
		if (!vis) return;

		const n = this.hist.length;
		for (let i = 0; i < HIST; i++) {
			const j = i * 3;
			if (i < n) {
				const h = this.hist[i];
				this._pp[j] = h.x; this._pp[j + 1] = h.y; this._pp[j + 2] = h.z;
				const al = i / n;
				this._pc[j] = 0.9 + al * 0.1; this._pc[j + 1] = 0.4 * al; this._pc[j + 2] = 0.05 * al;
				this._ps[i] = (0.38 + al * 4.5) * sc;
			} else {
				this._pp[j] = this._pp[(n - 1) * 3]; this._pp[j + 1] = this._pp[(n - 1) * 3 + 1]; this._pp[j + 2] = this._pp[(n - 1) * 3 + 2];
				this._ps[i] = 0;
			}
		}
		this.pPts.geometry.attributes.position.needsUpdate = true;
		this.pPts.geometry.attributes.aCol.needsUpdate = true;
		this.pPts.geometry.attributes.aSz.needsUpdate = true;
		this.pPts.geometry.setDrawRange(0, n);

		for (let i = 0; i < FUT; i++) {
			const frac = (i + 1) / FUT;
			const fp = this.pos(t + frac * 0.9, camZ, leviathanMerge);
			const j = i * 3;
			this._fp[j] = fp.x; this._fp[j + 1] = fp.y; this._fp[j + 2] = fp.z;
			const al = 1 - frac;
			this._fc[j] = 0.05 * al; this._fc[j + 1] = 0.5 + al * 0.3; this._fc[j + 2] = 1.0;
			this._fs[i] = (0.3 + al * 3.8) * sc;
		}
		this.fPts.geometry.attributes.position.needsUpdate = true;
		this.fPts.geometry.attributes.aCol.needsUpdate = true;
		this.fPts.geometry.attributes.aSz.needsUpdate = true;
		this.fPts.geometry.setDrawRange(0, FUT);
	}

	hide(): void { this.dot.visible = false; this.pPts.visible = false; this.fPts.visible = false; }
	addToScene(scene: THREE.Scene): void { scene.add(this.dot, this.pPts, this.fPts); }
	dispose(): void {
		this.dot.geometry.dispose(); (this.dot.material as THREE.Material).dispose();
		this.pPts.geometry.dispose(); (this.pPts.material as THREE.Material).dispose();
		this.fPts.geometry.dispose(); (this.fPts.material as THREE.Material).dispose();
	}
}

interface TunnelUniforms {
	uTime: THREE.Uniform<number>;
	uWaveAmp: THREE.Uniform<number>;
	uPulse: THREE.Uniform<number>;
	uBase: THREE.Uniform<THREE.Color>;
	uGlowA: THREE.Uniform<THREE.Color>;
	uGlowB: THREE.Uniform<THREE.Color>;
	uAccent: THREE.Uniform<THREE.Color>;
	uGlowIntensity: THREE.Uniform<number>;
}

interface TunnelHaloUniforms {
	uTime: THREE.Uniform<number>;
	uDrift: THREE.Uniform<number>;
	uColorA: THREE.Uniform<THREE.Color>;
	uColorB: THREE.Uniform<THREE.Color>;
	uIntensity: THREE.Uniform<number>;
}

interface CageUniforms { uTime: THREE.Uniform<number>; uInten: THREE.Uniform<number>; uCol: THREE.Uniform<THREE.Color>; }
interface GlowUniforms { uCol: THREE.Uniform<THREE.Color>; uPulse: THREE.Uniform<number>; }

export interface B5LesserState extends ExperienceState {
	scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera;
	phase: number; phaseT: number;

	camZ: number; camPos: THREE.Vector3; heading: number; lateralX: number; currentSpeed: number;
	delayedPitch: number; delayedRoll: number;

	tunnelSpeed: number; baseSpeed: number;
	phaseDuration: number; bendSpeed: number;

	orientation: { pitch: number; roll: number };
	speed: { accelerate: boolean; brake: boolean };
	dominantEye: "left" | "right" | null;

	postfxComposer: EffectComposer; postfxRender: () => void; blesserEffect: B5LesserEffect; postfxDeltaRef: { value: number };
	postCA: number; postWarp: number; postFlick: number; hbPulse: number; tunnelReveal: number;

	tunnelMesh: THREE.Mesh; tunnelU: TunnelUniforms; tunnelLight: THREE.PointLight;
	tunnelHalo: THREE.Mesh; tunnelHaloU: TunnelHaloUniforms;
	tunnelCurve: THREE.CatmullRomCurve3;
	tunnelFrames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
	tunnelProgress: number;
	tunnelParticles: THREE.Points; tunnelParticleMat: THREE.ShaderMaterial;
	tunnelFog: THREE.Mesh[]; tunnelFogMat: THREE.ShaderMaterial[];
	canalMesh: THREE.Mesh; canalMat: THREE.ShaderMaterial; canalScrollOffset: number;

	circleSymbol: THREE.Mesh; triangleSymbol: THREE.Mesh; circleGlowU: GlowUniforms; triangleGlowU: GlowUniforms;
	closedDoor: THREE.Mesh; openDoor: THREE.Mesh;

	cageMesh: THREE.Mesh; cageU: CageUniforms;
	stars: THREE.Points; nebula: THREE.Points;
	trails: TrailObject[]; trailSc: number;
	gpMesh: THREE.Points; gpGeo: THREE.BufferGeometry; gpSamp: THREE.Vector3[];
	threats: THREE.Mesh[]; threatGlowU: GlowUniforms[];
	_onResize: () => void;
	startScreen: THREE.Sprite;
	leanStartTime: number;
	exitLight: THREE.PointLight;
	exitGlow: THREE.Mesh;
}

const TUNNEL_R = 6.4; const TUNNEL_LEN = 320; const CAGE_R = 16; const CAGE_LEN = 400; const GP_N = 850;
const CANAL_RADIUS = 3.5; const CANAL_LENGTH = 700; const CANAL_NEAR = 10; const CANAL_FAR = 10 - CANAL_LENGTH;
const CANAL_RAD_SEG = 32; const CANAL_Z_SEG = 100;

export async function setup(ctx: SetupContext): Promise<B5LesserState> {
	const { scene, renderer } = ctx;
	const camera = new THREE.PerspectiveCamera(86, 1, 0.05, 600);
	const fogColor = new THREE.Color(0x000000);
	scene.fog = new THREE.FogExp2(fogColor, 0.02);
	scene.background = fogColor;

	const blesserEffect = new B5LesserEffect();
	const bloom = new BloomEffect({ intensity: 1.35, luminanceThreshold: 0.32, luminanceSmoothing: 0.45, mipmapBlur: true });
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(new EffectPass(camera, bloom, blesserEffect));
	composer.setSize(window.innerWidth, window.innerHeight);

	const postfxDeltaRef = { value: 0.016 };
	const postfxRender = () => composer.render(postfxDeltaRef.value);

	const tunnelPoints: THREE.Vector3[] = [];
	for (let z = 0; z <= TUNNEL_LEN; z += 3) {
		const t = -z * 0.04;
		tunnelPoints.push(
			new THREE.Vector3(
				Math.sin(t) * 5.5 + Math.sin(t * 0.35) * 3.2,
				Math.cos(t * 0.45) * 4.8 + Math.sin(t * 0.25) * 2.6,
				-z,
			),
		);
	}
	const tunnelCurve = new THREE.CatmullRomCurve3(tunnelPoints);
	const tunnelFrames = tunnelCurve.computeFrenetFrames(240, false);

	const tunnelU: TunnelUniforms = {
		uTime: new THREE.Uniform(0.0),
		uWaveAmp: new THREE.Uniform(0.4),
		uPulse: new THREE.Uniform(0.0),
		uBase: new THREE.Uniform(new THREE.Color(0x040009)),
		uGlowA: new THREE.Uniform(new THREE.Color(0.55, 0.22, 0.8)),
		uGlowB: new THREE.Uniform(new THREE.Color(0.95, 0.42, 0.82)),
		uAccent: new THREE.Uniform(new THREE.Color(0.98, 0.8, 0.92)),
		uGlowIntensity: new THREE.Uniform(0.9),
	};
	const tunnelMesh = new THREE.Mesh(
		new THREE.TubeGeometry(tunnelCurve, 280, TUNNEL_R, 32, false),
		new THREE.ShaderMaterial({
			vertexShader: tunnelVert,
			fragmentShader: tunnelFrag,
			uniforms: tunnelU as any,
			side: THREE.BackSide,
		})
	);
	scene.add(tunnelMesh);

	// ── Straight tube (Phase 1 — b3.lesser style) ──
	const canalMat = createCanalMaterial();
	const canalMesh = buildCanal(canalMat);

	const texLoader = new THREE.TextureLoader();
	const diffuseTex = texLoader.load(meatDiffuseUrl);
	diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;
	diffuseTex.repeat.set(1, 1);
	canalMat.uniforms.uDiffuse.value = diffuseTex;

	canalMesh.visible = false;
	scene.add(canalMesh);

	const tunnelHaloU: TunnelHaloUniforms = {
		uTime: new THREE.Uniform(0.0),
		uDrift: new THREE.Uniform(0.14),
		uColorA: new THREE.Uniform(new THREE.Color(0.55, 0.2, 0.9)),
		uColorB: new THREE.Uniform(new THREE.Color(0.95, 0.5, 0.8)),
		uIntensity: new THREE.Uniform(0.0),
	};
	const tunnelHalo = new THREE.Mesh(
		new THREE.TubeGeometry(tunnelCurve, 180, TUNNEL_R * 1.2, 28, false),
		new THREE.ShaderMaterial({
			vertexShader: tunnelHaloVert,
			fragmentShader: tunnelHaloFrag,
			uniforms: tunnelHaloU as any,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.BackSide,
		})
	);
	scene.add(tunnelHalo);

	const tunnelLight = new THREE.PointLight(0x4a1a88, 3.2, 28); scene.add(tunnelLight);
	const tunnelAmbient = new THREE.AmbientLight(0x120a2a, 0.2); scene.add(tunnelAmbient);

	const particleCount = 8000;
	const pPos = new Float32Array(particleCount * 3);
	const pCol = new Float32Array(particleCount * 3);
	const pSz = new Float32Array(particleCount);
	const pPh = new Float32Array(particleCount);
	const color = new THREE.Color();
	for (let i = 0; i < particleCount; i++) {
		const t = Math.random();
		const pt = tunnelCurve.getPointAt(t);
		const idx = Math.min(tunnelFrames.normals.length - 1, Math.floor(t * tunnelFrames.normals.length));
		const n = tunnelFrames.normals[idx];
		const b = tunnelFrames.binormals[idx];
		const ang = Math.random() * Math.PI * 2;
		const rad = Math.random() * (TUNNEL_R * 0.95);
		const offset = new THREE.Vector3()
			.addScaledVector(n, Math.cos(ang) * rad)
			.addScaledVector(b, Math.sin(ang) * rad);
		const pos = pt.clone().add(offset);
		pPos[i * 3] = pos.x;
		pPos[i * 3 + 1] = pos.y;
		pPos[i * 3 + 2] = pos.z;
		const r = Math.random();
		if (r < 0.6) {
			color.setHSL(0.88, 0.45, 0.82);
		} else if (r < 0.9) {
			color.setHSL(0.78, 0.4, 0.78);
		} else {
			color.setHSL(0.62, 0.35, 0.75);
		}
		pCol[i * 3] = color.r;
		pCol[i * 3 + 1] = color.g;
		pCol[i * 3 + 2] = color.b;
		pSz[i] = 0.08 + Math.random() * 0.35;
		pPh[i] = Math.random() * Math.PI * 2;
	}
	const pGeo = new THREE.BufferGeometry();
	pGeo.setAttribute("position", new THREE.Float32BufferAttribute(pPos, 3));
	pGeo.setAttribute("aCol", new THREE.Float32BufferAttribute(pCol, 3));
	pGeo.setAttribute("aSz", new THREE.Float32BufferAttribute(pSz, 1));
	pGeo.setAttribute("aPh", new THREE.Float32BufferAttribute(pPh, 1));
	const tunnelParticleMat = new THREE.ShaderMaterial({
		vertexShader: starVert,
		fragmentShader: starFrag,
		uniforms: { uTime: { value: 0 } },
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	const tunnelParticles = new THREE.Points(pGeo, tunnelParticleMat);
	tunnelParticles.visible = true;
	scene.add(tunnelParticles);

	const fogGeo = new THREE.CircleGeometry(4, 16);
	const fogV = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
	const fogF = "uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.0, d) * 0.07; a *= 0.5 + 0.5 * sin(uTime + vUv.x * 3.0); gl_FragColor = vec4(uColor, a); }";
	const tunnelFog: THREE.Mesh[] = [];
	const tunnelFogMat: THREE.ShaderMaterial[] = [];
	for (let i = 0; i < 90; i++) {
		const zPos = -Math.random() * TUNNEL_LEN - 5;
		const t = Math.min(0.999, Math.max(0.001, -zPos / TUNNEL_LEN));
		const path = tunnelCurve.getPointAt(t);
		const ang = (Math.random() - 0.5) * Math.PI * 0.6;
		const rad = (Math.random() - 0.5) * 1.4;
		const fogMat = new THREE.ShaderMaterial({
			vertexShader: fogV,
			fragmentShader: fogF,
			uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.5, 0.25, 0.85) } },
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide,
		});
		const fog = new THREE.Mesh(fogGeo, fogMat);
		const fogRadius = 2 + Math.random() * 2.5;
		fog.scale.set(fogRadius, fogRadius, 1);
		fog.position.set(path.x + Math.cos(ang) * rad, path.y + Math.sin(ang) * rad, zPos);
		fog.lookAt(path.x, path.y, zPos + 1);
		fog.userData.offset = Math.random() * 6.28;
		scene.add(fog);
		tunnelFog.push(fog);
		tunnelFogMat.push(fogMat);
	}

	const circleGlowU: GlowUniforms = { uCol: new THREE.Uniform(new THREE.Color(0.9, 0.75, 0.2)), uPulse: new THREE.Uniform(1.0) };
	const circleSymbol = new THREE.Mesh(
		new THREE.RingGeometry(0.7, 1.1, 64),
		new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: glowFrag, uniforms: circleGlowU as any, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
	);
	circleSymbol.layers.set(1); circleSymbol.visible = false; scene.add(circleSymbol);

	const triPts = new Float32Array([1.1,0,0, -0.55,0.95,0, -0.55,-0.95,0]);
	const triGeo = new THREE.BufferGeometry(); triGeo.setAttribute("position", new THREE.Float32BufferAttribute(triPts, 3));
	triGeo.setAttribute("normal", new THREE.Float32BufferAttribute([0,0,1, 0,0,1, 0,0,1], 3)); triGeo.setIndex([0, 1, 2]);
	const triangleGlowU: GlowUniforms = { uCol: new THREE.Uniform(new THREE.Color(0.3, 0.7, 1.0)), uPulse: new THREE.Uniform(1.0) };
	const triangleSymbol = new THREE.Mesh(
		triGeo, new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: glowFrag, uniforms: triangleGlowU as any, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
	);
	triangleSymbol.layers.set(2); triangleSymbol.visible = false; scene.add(triangleSymbol);

	const closedDoor = new THREE.Mesh(
		new THREE.BoxGeometry(4, 6, 0.5),
		new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true })
	);
	closedDoor.visible = false; scene.add(closedDoor);

	const openDoor = new THREE.Mesh(
		new THREE.BoxGeometry(4, 6, 0.5),
		new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: false, transparent: true, opacity: 0.5 })
	);
	openDoor.visible = false; scene.add(openDoor);

	const cageU: CageUniforms = { uTime: new THREE.Uniform(0.0), uInten: new THREE.Uniform(0.0), uCol: new THREE.Uniform(new THREE.Color(0x1a3acc)) };
	const cageMesh = new THREE.Mesh(
		createCylGeo(CAGE_R, CAGE_LEN, 72, 260),
		new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: cageFrag, uniforms: cageU as any, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
	);
	cageMesh.visible = false; scene.add(cageMesh);

	const stars = createStarField(5500, CAGE_R + 1, 80, CAGE_LEN, (r) => r < 0.5 ? [0.72, 0.82, 1.0] : r < 0.82 ? [0.96, 0.96, 1.0] : [0.88, 0.92, 1.0], [0.28, 2.2]); scene.add(stars);
	const nebula = createStarField(900, 8, CAGE_R - 1, CAGE_LEN, (r) => r < 0.5 ? [0.06, 0.12, 0.48] : [0.22, 0.04, 0.42], [0.9, 3.5]); scene.add(nebula);

	const trails: TrailObject[] = Array.from({ length: TRAIL_N }, (_, i) => new TrailObject(i));
	for (const t of trails) t.addToScene(scene);

	const gpRel: THREE.Vector3[] = [];
	for (let i = 0; i <= 400; i++) {
		const t = i / 400; const z = 4 + t * 160;
		gpRel.push(new THREE.Vector3(Math.sin(t * 6.8 + 0.4) * 2.6 + Math.cos(t * 14 + 1.1) * 1.1 + Math.sin(t * 3.2) * 1.8, Math.cos(t * 5.3 + 0.8) * 2.0 + Math.sin(t * 9.2 + 0.5) * 1.2 + Math.cos(t * 2.1) * 1.4, z));
	}
	const gpSamp = new THREE.CatmullRomCurve3(gpRel).getPoints(GP_N);
	const gpPA = new Float32Array(GP_N * 3), gpCA = new Float32Array(GP_N * 3), gpSA = new Float32Array(GP_N);
	for (let i = 0; i < GP_N; i++) { gpCA[i * 3] = 1.0; gpCA[i * 3 + 1] = 0.82; gpCA[i * 3 + 2] = 0.18; gpSA[i] = 0.35 + Math.random() * 0.4; }
	const gpGeo = new THREE.BufferGeometry();
	gpGeo.setAttribute("position", new THREE.Float32BufferAttribute(gpPA, 3)); gpGeo.setAttribute("aCol", new THREE.Float32BufferAttribute(gpCA, 3)); gpGeo.setAttribute("aSz", new THREE.Float32BufferAttribute(gpSA, 1));
	const gpMesh = new THREE.Points(gpGeo, new THREE.ShaderMaterial({ vertexShader: particleVert, fragmentShader: particleFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
	gpMesh.visible = false; scene.add(gpMesh);

	const threatGlowU: GlowUniforms[] = [];
	const threats: THREE.Mesh[] = Array.from({ length: 8 }, (_, i) => {
		const gu: GlowUniforms = { uCol: new THREE.Uniform(new THREE.Color(0xcc6600)), uPulse: new THREE.Uniform(1.0) }; threatGlowU.push(gu);
		const m = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.45, 14, 10), new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: glowFrag, uniforms: gu as any, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		m.userData = { spd: 0.35 + Math.random() * 0.65, rad: 2.2 + Math.random() * 2.8, ph: Math.random() * Math.PI * 2, off: 14 + i * 18 }; m.visible = false; scene.add(m); return m;
	});

	const _onResize = () => { composer.setSize(window.innerWidth, window.innerHeight); }; window.addEventListener("resize", _onResize);
	renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.0;

	const canvas = document.createElement("canvas");
	canvas.width = 512; canvas.height = 256;
	const cx = canvas.getContext("2d")!;
	cx.fillStyle = "transparent"; cx.clearRect(0, 0, 512, 256);
	cx.textAlign = "center"; cx.textBaseline = "middle";
	cx.fillStyle = "#ffffff";
	cx.font = "bold 48px monospace";
	cx.fillText("upload yourself", 256, 100);
	cx.font = "20px monospace";
	cx.fillStyle = "#888888";
	cx.fillText("lean forward to start", 256, 170);
	const tex = new THREE.CanvasTexture(canvas);
	tex.needsUpdate = true;
	const startScreen = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
	startScreen.position.set(0, 0, -6);
	startScreen.scale.set(12, 6, 1);
	scene.add(startScreen);

	const exitLight = new THREE.PointLight(0xff2200, 2, 200);
	exitLight.position.set(0, 0, CANAL_FAR);
	scene.add(exitLight);

	const exitGlow = new THREE.Mesh(
		new THREE.SphereGeometry(8, 16, 12),
		new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
	);
	exitGlow.position.set(0, 0, CANAL_FAR);
	exitGlow.visible = false;
	scene.add(exitGlow);

	const state: B5LesserState = {
		scene, renderer, camera, phase: 0, phaseT: 0, camZ: -2, camPos: new THREE.Vector3(0, 0, -2), heading: 0, lateralX: 0, currentSpeed: 0,
		delayedPitch: 0, delayedRoll: 0, tunnelSpeed: 0.28, baseSpeed: 5, phaseDuration: 35, bendSpeed: 0.005,
		orientation: { pitch: 0, roll: 0 }, speed: { accelerate: false, brake: false }, dominantEye: null,
		postfxComposer: composer, postfxRender, blesserEffect, postfxDeltaRef, postCA: 0.0, postWarp: 0, postFlick: 0, hbPulse: 0, tunnelReveal: 0,
		tunnelMesh, tunnelU, tunnelLight, tunnelHalo, tunnelHaloU,
		tunnelCurve, tunnelFrames, tunnelProgress: 0,
		tunnelParticles, tunnelParticleMat, tunnelFog, tunnelFogMat,
		canalMesh, canalMat, canalScrollOffset: 0,
		circleSymbol, triangleSymbol, circleGlowU, triangleGlowU, closedDoor, openDoor,
		cageMesh, cageU, stars, nebula, trails, trailSc: 1, gpMesh, gpGeo, gpSamp, threats, threatGlowU, _onResize, startScreen, leanStartTime: 0,
	};

	keyHandler = (e: KeyboardEvent): void => {
		const k = e.key;
		const num = k.length === 1 ? parseInt(k) : parseInt(k.replace("Numpad", ""));
		if (!isNaN(num) && num >= 0 && num <= 5) applyPhase(state, num);
	};
	document.addEventListener("keydown", keyHandler);

	return state;
}

export function applyPhase(s: B5LesserState, phase: number): void {
	s.phase = phase;
	s.phaseT = 0;
	s.leanStartTime = 0;
	s.startScreen.visible = phase === 0;
	if (phase === 0) {
		s.renderer.toneMappingExposure = 0;
		s.camera.position.set(0, 0, 0);
		s.camera.rotation.set(0, 0, 0);
	} else if (phase === 1) {
		s.canalScrollOffset = CANAL_NEAR;
		s.renderer.toneMappingExposure = 0.5;
		s.camera.position.set(0, 0, 0);
		s.camera.rotation.set(0, 0, 0);
	} else if (phase >= 2 && phase <= 4) {
		s.camPos.set(0, 0, 0);
		s.heading = 0;
		s.currentSpeed = 0;
		s.lateralX = 0;
		s.camera.position.set(0, 0, 0);
		s.renderer.toneMappingExposure = 1.15;
	} else if (phase === 5) {
		s.tunnelProgress = 0;
		s.camPos.set(0, 0, 0);
		s.heading = 0;
		s.currentSpeed = 0;
		s.camera.position.set(0, 0, 0);
		s.renderer.toneMappingExposure = 0.8;
	}
}

let keyHandler: ((e: KeyboardEvent) => void) | null = null;

const _tmpColor = new THREE.Color();

export function tick(state: ExperienceState, ctx: TickContext): { state: ExperienceState } {
	const s = state as B5LesserState;
	const { delta, elapsed } = ctx;

	s.phaseT += delta;
	s.postfxDeltaRef.value = delta;
	const L = Math.min(1, delta * 1.5);

	let tCA = 0.0, tWarp = 0.0, tFlick = 0.0;
	if (s.phase === 0) { tCA = 0.0; tWarp = 0.0; }
	else if (s.phase === 1) { tCA = 0.14; tWarp = 0.0; }
	else if (s.phase === 2) { tCA = 0.28; tWarp = 0.0; }
	else if (s.phase === 3) { tCA = 0.52 + Math.min(s.phaseT / 30, 1) * 0.48; tWarp = Math.min(s.phaseT / 30, 0.75); }
	else if (s.phase === 4) { tCA = 1.2; tWarp = 0.9 + Math.sin(elapsed * 8) * 0.3; tFlick = 0.4; }
	else if (s.phase === 5) { tCA = Math.max(0, 0.14 - s.phaseT * 0.01); tWarp = 0.0; tFlick = 0.0; }

	s.postCA += (tCA - s.postCA) * L;
	s.postWarp += (tWarp - s.postWarp) * L * (s.phase === 4 ? 3.0 : 0.55);
	s.postFlick += (tFlick - s.postFlick) * L;

	const hbRaw = Math.pow(Math.max(0, Math.sin(elapsed * Math.PI * 1.15 - 0.2)), 10.0);
	s.hbPulse += (hbRaw - s.hbPulse) * Math.min(1, delta * 18);
	s.blesserEffect.setCA(s.postCA); s.blesserEffect.setWarp(s.postWarp); s.blesserEffect.setFlicker(s.postFlick); s.blesserEffect.setTime(elapsed * 100);
	const hbPhase = s.phase === 0 ? s.hbPulse * 0.3 : s.phase === 1 ? s.hbPulse * Math.max(0, 1.2 - s.tunnelReveal * 2.0) : s.phase === 5 ? s.hbPulse * 0.5 : 0;
	s.blesserEffect.setHeartbeat(hbPhase);

	const fogTargets = [
		{ density: 0.02, hex: 0x000000 },
		{ density: 0.014, hex: 0x05000c },
		{ density: 0.005, hex: 0x010316 },
		{ density: 0.004, hex: 0x010218 },
		{ density: 0.008, hex: 0x0a0108 },
		{ density: 0.018, hex: 0x05000c },
	];
	const ft = fogTargets[s.phase] ?? fogTargets[0];
	const fog = s.scene.fog as THREE.FogExp2;
	_tmpColor.setHex(ft.hex); fog.color.lerp(_tmpColor, delta * 0.5);
	fog.density += (ft.density - fog.density) * delta * 0.8;

	const { pitch, roll } = s.orientation;
	const { accelerate, brake } = s.speed;
	let bobX = Math.sin(elapsed * 0.43) * 0.22;
	let bobY = Math.cos(elapsed * 0.37) * 0.28;

	const targetSpd = s.baseSpeed * (accelerate ? 2.0 : brake ? 0.3 : 1.0);

	if (s.phase === 0) {
		s.renderer.toneMappingExposure += (0.5 - s.renderer.toneMappingExposure) * delta * 0.5;
		s.postCA += (0.0 - s.postCA) * L;
		s.startScreen.visible = true;

		if (pitch < -0.2) {
			if (s.leanStartTime === 0) s.leanStartTime = elapsed;
			else if (elapsed - s.leanStartTime >= 3) {
				s.startScreen.visible = false;
				applyPhase(s, 1);
			}
		} else {
			s.leanStartTime = 0;
		}
	} else if (s.phase === 1) {
		const pitchFactor = Math.max(-pitch * 2, 0);
		const forwardSpd = (s.tunnelSpeed * 6 + pitchFactor) * (accelerate ? 1.8 : brake ? 0.3 : 1.0);
		s.canalScrollOffset -= forwardSpd * delta;

		const xTarget = roll * 2.2;
		s.camera.position.x += (xTarget - s.camera.position.x) * delta * 4;
		s.camera.position.x = Math.min(2.6, Math.max(-2.6, s.camera.position.x));
		s.camera.position.y = 0;
		s.camera.position.z = s.canalScrollOffset;
		s.camera.lookAt(s.camera.position.x, 0, s.camera.position.z - 50);

		s.canalMat.uniforms.uLightZ.value = s.canalScrollOffset - 30;
		const reveal = Math.min(1, s.phaseT / 4.0);
		s.canalMat.uniforms.uVoidReveal.value = reveal;
		s.canalMat.uniforms.uTime.value = elapsed;
		const periPulse = 0.8 + 0.2 * Math.sin(elapsed * 0.8);
		s.canalMat.uniforms.uPeriStrength.value = 4.0 * periPulse;

		s.renderer.toneMappingExposure += (1.0 - s.renderer.toneMappingExposure) * delta * 0.5;

		if (s.canalScrollOffset <= CANAL_FAR) {
			applyPhase(s, 2);
		}
	} else if (s.phase >= 2 && s.phase <= 4) {
		const DEG2RAD = Math.PI / 180;
		let sysInf = s.phase === 3 ? Math.min(1, s.phaseT / 30) : s.phase === 4 ? 1.0 : 0;
		const forcedRoll = Math.sin(elapsed * 0.08) * 15 * sysInf;
		const blendRoll = roll * (1 - sysInf * (s.phase === 4 ? 1.0 : 0.8)) + forcedRoll;
		const blendPitch = pitch * (1 - sysInf * 0.5);

		s.heading -= blendRoll * (DEG2RAD * 1.5) * delta;
		s.currentSpeed += (targetSpd - s.currentSpeed) * delta * 1.2;
		s.camPos.x += Math.sin(s.heading) * s.currentSpeed * delta;
		s.camPos.z += Math.cos(s.heading) * s.currentSpeed * delta;
		s.camPos.y -= blendPitch * DEG2RAD * s.currentSpeed * 0.5 * delta;
		s.camZ = s.camPos.z;

		const wPull = s.phase >= 3 ? s.postWarp * Math.sin(elapsed * 0.55) * 3.8 : 0;
		s.camera.position.set(s.camPos.x + bobX, s.camPos.y + bobY, s.camPos.z);
		s.camera.lookAt(s.camPos.x + Math.sin(s.heading) * 22 + wPull, s.camPos.y + blendPitch * 9 + bobY * 2, s.camPos.z + Math.cos(s.heading) * 22);

		const tFov = 86 + (s.phase >= 3 ? s.postWarp * 35 : s.phase === 4 ? 50 : 0);
		s.camera.fov += (tFov - s.camera.fov) * delta * (s.phase === 4 ? 5.0 : 1.8);
		s.camera.updateProjectionMatrix();

		if (s.phase === 2 && s.phaseT >= s.phaseDuration) { s.phase = 3; s.phaseT = 0; }
		else if (s.phase === 3 && s.phaseT >= s.phaseDuration) { s.phase = 4; s.phaseT = 0; }
	} else if (s.phase === 5) {
		s.tunnelProgress = Math.min(1, s.tunnelProgress + (s.tunnelSpeed * delta * 0.8) / TUNNEL_LEN);
		const t = Math.min(0.999, Math.max(0.001, s.tunnelProgress));
		const cp = s.tunnelCurve.getPointAt(t);
		const next = s.tunnelCurve.getPointAt(Math.min(0.999, t + 0.006));
		const fi = Math.min(s.tunnelFrames.normals.length - 1, Math.floor(t * s.tunnelFrames.normals.length));
		const n = s.tunnelFrames.normals[fi];
		const b = s.tunnelFrames.binormals[fi];

		s.camera.position.lerp(cp, 0.15);
		s.camera.lookAt(next);
		s.camZ = s.camera.position.z;

		s.renderer.toneMappingExposure += (0.8 - s.renderer.toneMappingExposure) * delta * 0.3;
	}

	s.canalMesh.visible = s.phase === 1;

	const showCurved = s.phase === 5;
	s.tunnelMesh.visible = showCurved;
	s.tunnelHalo.visible = showCurved;
	s.tunnelParticles.visible = showCurved;
	for (const fog of s.tunnelFog) fog.visible = showCurved;
	if (showCurved) {
		s.tunnelReveal = Math.min(1, s.tunnelReveal + delta * 0.2);
		s.tunnelParticleMat.opacity = Math.min(0.6, (s.tunnelParticleMat.opacity ?? 0) + delta * 0.4);
		s.tunnelU.uTime.value = elapsed;
		s.tunnelU.uGlowIntensity.value = 0.05 + s.tunnelReveal * 0.6;
		s.tunnelU.uWaveAmp.value = 0.1 + s.tunnelReveal * 0.3;
		s.tunnelLight.position.copy(s.camera.position);
		s.tunnelParticleMat.uniforms.uTime.value = elapsed;
		for (let i = 0; i < s.tunnelFog.length; i++) {
			s.tunnelFogMat[i].uniforms.uTime.value = elapsed + (s.tunnelFog[i].userData.offset as number);
		}
		s.tunnelHaloU.uTime.value = elapsed;
		s.tunnelHaloU.uIntensity.value = 0.02 + s.tunnelReveal * 0.2;
	}

	const showExit = s.phase === 5 && s.tunnelProgress > 0.85;
	s.closedDoor.visible = showExit; s.openDoor.visible = showExit;
	if (showExit) {
		const endPos = s.tunnelCurve.getPointAt(0.999);
		const endT = s.tunnelCurve.getTangentAt(0.999);
		const doorPos = endPos.clone().addScaledVector(endT, 3.0);
		s.closedDoor.position.copy(doorPos);
		s.openDoor.position.copy(doorPos);
		s.closedDoor.lookAt(s.camera.position);
		s.openDoor.lookAt(s.camera.position);
	}

	if (showExit) {
		if (s.renderer.xr.isPresenting) {
			const xrCam = s.renderer.xr.getCamera() as THREE.ArrayCamera;
			if (xrCam.cameras && xrCam.cameras.length === 2) {
				const left = xrCam.cameras[0], right = xrCam.cameras[1];
				let layerLeft = showExit && s.dominantEye === "right" ? 2 : 1;
				let layerRight = showExit && s.dominantEye === "left" ? 1 : 2;
				left.layers.enable(0); left.layers.enable(layerLeft); left.layers.disable(layerRight);
				right.layers.enable(0); right.layers.disable(layerLeft); right.layers.enable(layerRight);
			}
		} else { s.camera.layers.enableAll(); }
	} else if (!s.renderer.xr.isPresenting) { s.camera.layers.enable(0); }

	const showCage = s.phase >= 2 && s.phase <= 4;
	s.cageMesh.visible = showCage; s.stars.visible = showCage; s.nebula.visible = showCage;
	if (showCage) {
		s.cageMesh.position.set(0, 0, s.camZ - 80); s.cageU.uTime.value = elapsed;
		s.stars.position.set(0, 0, s.camZ - 50); s.nebula.position.set(0, 0, s.camZ - 50);
		(s.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
		(s.nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
	}

	const leviathanMerge = s.phase === 4 ? Math.min(1.0, s.phaseT / 3.0) : 0;
	const trailScTarget = s.phase >= 3 ? 1.5 + Math.sin(elapsed * 1.9) * 0.5 : 1.0;
	s.trailSc += (trailScTarget - s.trailSc) * L;

	const showTrails = s.phase >= 2 && s.phase <= 4;
	for (const tr of s.trails) {
		if (showTrails) tr.update(elapsed, s.camZ, true, s.trailSc, leviathanMerge);
		else tr.hide();
	}

	s.gpMesh.visible = showTrails && s.phase !== 4;
	if (s.gpMesh.visible) {
		const pa = s.gpGeo.attributes.position.array as Float32Array;
		for (let i = 0; i < GP_N; i++) {
			pa[i * 3] = s.gpSamp[i].x; pa[i * 3 + 1] = s.gpSamp[i].y; pa[i * 3 + 2] = s.gpSamp[i].z + s.camZ;
		}
		s.gpGeo.attributes.position.needsUpdate = true;
	}

	const showThreats = s.phase >= 2 && s.phase <= 3;
	s.threats.forEach((t, i) => {
		t.visible = showThreats;
		if (showThreats) {
			const d = t.userData as { spd: number; rad: number; ph: number; off: number };
			const a = elapsed * d.spd + d.ph;
			t.position.set(Math.cos(a) * d.rad, Math.sin(a * 1.38) * d.rad * 0.75, s.camZ + d.off);
			s.threatGlowU[i].uPulse.value = 0.7 + Math.sin(elapsed * 3.5 + i) * 0.35;
		}
	});

	return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
	const s = state as B5LesserState;
	window.removeEventListener("resize", s._onResize);
	if (keyHandler) document.removeEventListener("keydown", keyHandler);
	s.postfxComposer.dispose();

	s.startScreen.material.dispose(); (s.startScreen.material as THREE.SpriteMaterial).map?.dispose();
	scene.remove(s.startScreen);

	[s.tunnelMesh, s.tunnelHalo, s.tunnelParticles, s.circleSymbol, s.triangleSymbol, s.cageMesh, s.stars, s.nebula, s.gpMesh, s.closedDoor, s.openDoor, s.canalMesh].forEach(m => {
		m.geometry.dispose(); (m.material as THREE.Material).dispose(); scene.remove(m);
	});
	scene.remove(s.tunnelLight); s.tunnelLight.dispose();

	for (const child of [...scene.children]) {
		if (child instanceof THREE.AmbientLight) scene.remove(child);
	}

	for (const fog of s.tunnelFog) {
		fog.geometry.dispose();
		(fog.material as THREE.Material).dispose();
		scene.remove(fog);
	}

	for (const t of s.trails) { t.dispose(); scene.remove(t.dot, t.pPts, t.fPts); }
	for (const t of s.threats) { t.geometry.dispose(); (t.material as THREE.Material).dispose(); scene.remove(t); }
}
