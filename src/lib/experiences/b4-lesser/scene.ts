import * as THREE from "three";
import {
	BloomEffect,
	Effect,
	EffectComposer,
	EffectPass,
	RenderPass,
} from "postprocessing";
import type { ExperienceState, SetupContext, TickContext } from "../types";

// ── Raw shader imports ──────────────────────────────────────────────────
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

// ── Explicit Texture Imports for Vite Bundling ──────────────────────────
// @ts-ignore
import colorMapUrl from "./textures/tiles.2/tiles_0121_color_4k.jpg?url";
// @ts-ignore
import aoMapUrl from "./textures/tiles.2/tiles_0121_ao_4k.jpg?url";
// @ts-ignore
import heightMapUrl from "./textures/tiles.2/tiles_0121_height_4k.png?url";
// @ts-ignore
import normalMapUrl from "./textures/tiles.2/tiles_0121_normal_opengl_4k.png?url";

// ═══════════════════════════════════════════════════════════════════════
//  CUSTOM POST-PROCESSING EFFECT
// ═══════════════════════════════════════════════════════════════════════

class B4LesserEffect extends Effect {
	constructor() {
			super("B4LesserEffect", postFrag, {
			uniforms: new Map<string, THREE.Uniform<number>>([
				["uCA", new THREE.Uniform(0.14)],
				["uWarp", new THREE.Uniform(0.0)],
				["uVig", new THREE.Uniform(0.65)],
				["uFlicker", new THREE.Uniform(0.0)],
				["uHeartbeat", new THREE.Uniform(0.0)],
				["uTime", new THREE.Uniform(0.0)],
				["uScan", new THREE.Uniform(0.0)],
				["uVhs", new THREE.Uniform(0.0)],
				["uGlitch", new THREE.Uniform(0.0)],
				["uNonDomVig", new THREE.Uniform(0.0)],
				["uDomEye", new THREE.Uniform(0.0)],
				["uWhiteout", new THREE.Uniform(0.0)],
			]),
		});
	}

	setCA(v: number): void { (this.uniforms.get("uCA") as THREE.Uniform<number>).value = v; }
	setWarp(v: number): void { (this.uniforms.get("uWarp") as THREE.Uniform<number>).value = v; }
	setVig(v: number): void { (this.uniforms.get("uVig") as THREE.Uniform<number>).value = v; }
	setFlicker(v: number): void { (this.uniforms.get("uFlicker") as THREE.Uniform<number>).value = v; }
	setHeartbeat(v: number): void { (this.uniforms.get("uHeartbeat") as THREE.Uniform<number>).value = v; }
	setTime(v: number): void { (this.uniforms.get("uTime") as THREE.Uniform<number>).value = v; }
	setScan(v: number): void { (this.uniforms.get("uScan") as THREE.Uniform<number>).value = v; }
	setVhs(v: number): void { (this.uniforms.get("uVhs") as THREE.Uniform<number>).value = v; }
	setGlitch(v: number): void { (this.uniforms.get("uGlitch") as THREE.Uniform<number>).value = v; }
	setNonDomVig(v: number): void { (this.uniforms.get("uNonDomVig") as THREE.Uniform<number>).value = v; }
	setDomEye(v: number): void { (this.uniforms.get("uDomEye") as THREE.Uniform<number>).value = v; }
	setWhiteout(v: number): void { (this.uniforms.get("uWhiteout") as THREE.Uniform<number>).value = v; }
}

// ═══════════════════════════════════════════════════════════════════════
//  GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
//  TRAIL OBJECT
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
//  STATE INTERFACE
// ═══════════════════════════════════════════════════════════════════════

interface TunnelUniforms {
	uTime: THREE.Uniform<number>;
	uWaveAmp: THREE.Uniform<number>;
	uPulse: THREE.Uniform<number>;
	uBase: THREE.Uniform<THREE.Color>;
	uGlowA: THREE.Uniform<THREE.Color>;
	uGlowB: THREE.Uniform<THREE.Color>;
	uAccent: THREE.Uniform<THREE.Color>;
	uGlowIntensity: THREE.Uniform<number>;
	uTex: THREE.Uniform<THREE.Texture | null>;
	uTexAO: THREE.Uniform<THREE.Texture | null>;
	uTexHeight: THREE.Uniform<THREE.Texture | null>;
	uTexNormal: THREE.Uniform<THREE.Texture | null>;
	uTexScale: THREE.Uniform<THREE.Vector2>;
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

export interface B4LesserState extends ExperienceState {
	scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera;
	phase: number; phaseT: number;

	camZ: number; camPos: THREE.Vector3; heading: number; lateralX: number; currentSpeed: number;
	delayedPitch: number; delayedRoll: number;
	debugInput: { pitch: number; roll: number; accel: boolean; brake: boolean; active: boolean; phase: number | null };
	keys: Set<string>;
	moveVel: THREE.Vector3;
	lookYaw: number;
	lookPitch: number;

	tunnelSpeed: number; baseSpeed: number;
	phaseDuration: number; bendSpeed: number;

	orientation: { pitch: number; roll: number };
	speed: { accelerate: boolean; brake: boolean };
	dominantEye: "left" | "right" | null;

	postfxComposer: EffectComposer; postfxRender: () => void; blesserEffect: B4LesserEffect; postfxDeltaRef: { value: number };
	postCA: number; postWarp: number; postFlick: number; hbPulse: number; tunnelReveal: number;

	tunnelMesh: THREE.Mesh; tunnelU: TunnelUniforms; tunnelLight: THREE.PointLight;
	tunnelHalo: THREE.Mesh; tunnelHaloU: TunnelHaloUniforms;
	tunnelCurve: THREE.CatmullRomCurve3;
	tunnelFrames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
	tunnelProgress: number;
	tunnelParticles: THREE.Points; tunnelParticleMat: THREE.ShaderMaterial;
	tunnelFog: THREE.Mesh[]; tunnelFogMat: THREE.ShaderMaterial[];
	
	colorTex: THREE.Texture | null;
	aoTex: THREE.Texture | null;
	heightTex: THREE.Texture | null;
	normalTex: THREE.Texture | null;

	closedDoor: THREE.Object3D; openDoor: THREE.Object3D;
	closedDoorOutline: THREE.Object3D; openDoorOutline: THREE.Object3D;
	escapeStar: THREE.Mesh; escapeStarU: GlowUniforms;
	room: THREE.Mesh; roomLightL: THREE.PointLight; roomLightR: THREE.PointLight;
	roomBackLight: THREE.PointLight;

	cageMesh: THREE.Mesh; cageU: CageUniforms;
	stars: THREE.Points; nebula: THREE.Points;
	trails: TrailObject[]; trailSc: number;
	threats: THREE.Mesh[]; threatGlowU: GlowUniforms[];
	_onResize: () => void;
	_onKeyDown: (e: KeyboardEvent) => void;
	_onKeyUp: (e: KeyboardEvent) => void;
	_onMouseMove: (e: MouseEvent) => void;
}

const TUNNEL_R = 6.4; const TUNNEL_LEN = 320; const CAGE_R = 16; const CAGE_LEN = 400;

// ═══════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════

export async function setup(ctx: SetupContext): Promise<B4LesserState> {
	const { scene, renderer } = ctx;
	const camera = new THREE.PerspectiveCamera(86, 1, 0.05, 600);
	const fogColor = new THREE.Color(0x060011);
	scene.fog = new THREE.FogExp2(fogColor, 0.014);
	scene.background = fogColor;

	const blesserEffect = new B4LesserEffect();
	const bloom = new BloomEffect({ intensity: 1.35, luminanceThreshold: 0.32, luminanceSmoothing: 0.45, mipmapBlur: true });
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(new EffectPass(camera, bloom, blesserEffect));
	composer.setSize(window.innerWidth, window.innerHeight);

	const postfxDeltaRef = { value: 0.016 };
	const postfxRender = () => composer.render(postfxDeltaRef.value);

	// ── Curved tunnel path ─────────────────────────────────────────
	const tunnelPoints: THREE.Vector3[] = [];
	for (let z = 0; z <= TUNNEL_LEN; z += 3) {
		const t = -z * 0.05;
		tunnelPoints.push(
			new THREE.Vector3(
				Math.sin(t) * 6.8 + Math.sin(t * 0.42) * 4.1 + Math.cos(t * 0.18) * 2.2,
				Math.cos(t * 0.52) * 5.5 + Math.sin(t * 0.33) * 3.8 + Math.sin(t * 0.15) * 1.9,
				-z,
			),
		);
	}
	const tunnelCurve = new THREE.CatmullRomCurve3(tunnelPoints);
	const tunnelFrames = tunnelCurve.computeFrenetFrames(240, false);
	
	let stateRef: B4LesserState;

	const _onMouseMove = (e: MouseEvent) => {
		if (!stateRef || stateRef.phase !== 0) return;
		const sens = 0.0022;
		stateRef.lookYaw -= e.movementX * sens;
		stateRef.lookPitch -= e.movementY * sens;
		stateRef.lookPitch = Math.max(-1.2, Math.min(1.2, stateRef.lookPitch));
	};

	// ── Texture Loading ─────────────────────────────────────────
	const textureLoader = new THREE.TextureLoader();
	const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
	const fallbackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
	fallbackTex.needsUpdate = true;

	const calcPerfectTileScale = (img: HTMLImageElement | undefined, tileMeters: number): THREE.Vector2 => {
		const w = img?.width ?? 1024;
		const h = img?.height ?? 1024;
		const aspect = w / h;
		const circumference = 2 * Math.PI * TUNNEL_R;
		const repeatX = TUNNEL_LEN / tileMeters;
		const repeatY = circumference / (tileMeters * aspect);
		return new THREE.Vector2(repeatX, repeatY);
	};

	const prepTexture = (tex: THREE.Texture) => {
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.anisotropy = maxAnisotropy;
		tex.minFilter = THREE.LinearMipMapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
	};

	let colorTex: THREE.Texture = fallbackTex;
	let aoTex: THREE.Texture = fallbackTex;
	let heightTex: THREE.Texture = fallbackTex;
	let normalTex: THREE.Texture = fallbackTex;
	let groundScale = new THREE.Vector2(1, 1);

	try {
		[colorTex, aoTex, heightTex, normalTex] = await Promise.all([
			textureLoader.loadAsync(colorMapUrl),
			textureLoader.loadAsync(aoMapUrl),
			textureLoader.loadAsync(heightMapUrl),
			textureLoader.loadAsync(normalMapUrl)
		]);

		colorTex.colorSpace = THREE.SRGBColorSpace; 
		[colorTex, aoTex, heightTex, normalTex].forEach(prepTexture);
		groundScale = calcPerfectTileScale(colorTex.image, 2.5);
	} catch (e) {
		console.error("Texture load failed. Check URL imports at top of file.", e);
	}

	const tunnelU: TunnelUniforms = {
		uTime: new THREE.Uniform(0.0),
		uWaveAmp: new THREE.Uniform(0.4),
		uPulse: new THREE.Uniform(0.0),
		uBase: new THREE.Uniform(new THREE.Color(0x0a0112)),
		uGlowA: new THREE.Uniform(new THREE.Color(0x6600cc)),    // Deep Violet
		uGlowB: new THREE.Uniform(new THREE.Color(0xff4d00)),    // Searing Orange
		uAccent: new THREE.Uniform(new THREE.Color(0xffe600)),   // Intense Yellow
		uGlowIntensity: new THREE.Uniform(1.3), 
		uTex: new THREE.Uniform(colorTex),
		uTexAO: new THREE.Uniform(aoTex),
		uTexHeight: new THREE.Uniform(heightTex),
		uTexNormal: new THREE.Uniform(normalTex),
		uTexScale: new THREE.Uniform(groundScale),
	};

	const tunnelMesh = new THREE.Mesh(
		new THREE.TubeGeometry(tunnelCurve, 280, TUNNEL_R, 32, false),
		new THREE.ShaderMaterial({
			vertexShader: tunnelVert,
			fragmentShader: tunnelFrag,
			uniforms: tunnelU as any,
			transparent: false,
			depthWrite: true,
			side: THREE.BackSide,
		})
	);
	scene.add(tunnelMesh);

	const tunnelHaloU: TunnelHaloUniforms = {
		uTime: new THREE.Uniform(0.0),
		uDrift: new THREE.Uniform(0.14),
		uColorA: new THREE.Uniform(new THREE.Color(0x55, 0.2, 0.9)),
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

	// ── Room (post-suction) ───────────────────────────────────────
	const room = new THREE.Mesh(
		new THREE.BoxGeometry(40, 20, 50),
		new THREE.MeshStandardMaterial({
			color: 0x06060a,
			metalness: 0.1,
			roughness: 0.9,
			side: THREE.BackSide,
		}),
	);
	room.visible = false;
	scene.add(room);

	const roomLightL = new THREE.PointLight(0x7b2cff, 2.0, 18);
	const roomLightR = new THREE.PointLight(0xff5ab0, 2.0, 18);
	const roomBackLight = new THREE.PointLight(0xfff0f8, 1.0, 34);
	roomLightL.visible = false;
	roomLightR.visible = false;
	roomBackLight.visible = false;
	scene.add(roomLightL, roomLightR, roomBackLight);

	// ── Tunnel particles (Heatmap Dust - Increased to 25k) ─────────────────────────────
	const particleCount = 25000;
	const pPos = new Float32Array(particleCount * 3);
	const pCol = new Float32Array(particleCount * 3);
	const pSz = new Float32Array(particleCount);
	const pPh = new Float32Array(particleCount);
	const pColor = new THREE.Color();
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
		
        // Blue/Purple/Yellow Palette
		const r = Math.random();
		if (r < 0.33) {
			pColor.setHex(0x00d9ff); // Blue
		} else if (r < 0.66) {
			pColor.setHex(0x9d00ff); // Purple
		} else {
			pColor.setHex(0xffcc00); // Yellow
		}
		pCol[i * 3] = pColor.r;
		pCol[i * 3 + 1] = pColor.g;
		pCol[i * 3 + 2] = pColor.b;

		// Corrected particle size for anamorphic flares
		pSz[i] = 0.2 + Math.random() * 0.45;
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

	// ── Tunnel fog sheets ─────────────────────────────────────────
	const tunnelFog: THREE.Mesh[] = [];
	const tunnelFogMat: THREE.ShaderMaterial[] = [];

	// Load 3D door model
	const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
	const gltfLoader = new GLTFLoader();
	const doorUrl = new URL("./3d models/scene.gltf", import.meta.url).toString();
	const gltf = await gltfLoader.loadAsync(doorUrl);
	const doorModel = gltf.scene;
	if (!doorModel) throw new Error("Door model failed to load: scene.gltf");
	const rawBox = new THREE.Box3().setFromObject(doorModel);
	const rawSize = rawBox.getSize(new THREE.Vector3());
	if (rawSize.y <= 0.0001) throw new Error("Door model has invalid bounds");
	const targetDoorHeight = 6.0;
	const doorScale = targetDoorHeight / rawSize.y;
	doorModel.scale.setScalar(doorScale);
	const fittedBox = new THREE.Box3().setFromObject(doorModel);
	const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
	doorModel.position.x -= fittedCenter.x;
	doorModel.position.z -= fittedCenter.z;
	doorModel.position.y -= fittedBox.min.y;

	// Phase 5 Rivalry (The Escape Doors)
	const closedDoor = doorModel.clone();
	closedDoor.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			const mat = new THREE.MeshStandardMaterial({
				color: 0x0a0d1e,
				emissive: new THREE.Color(0x58a6ff),
				emissiveIntensity: 6.0,
				metalness: 0.05,
				roughness: 0.38,
				transparent: true,
				opacity: 0.9,
			});
			mat.map = null;
			mat.emissiveMap = null;
			child.material = mat;
		}
	});
	closedDoor.visible = false; scene.add(closedDoor);

	const openDoor = doorModel.clone();
	openDoor.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			const mat = new THREE.MeshStandardMaterial({
				color: 0x120a1e,
				emissive: new THREE.Color(0xff6ec7),
				emissiveIntensity: 6.0,
				metalness: 0.05,
				roughness: 0.38,
				transparent: true,
				opacity: 0.85,
			});
			mat.map = null;
			mat.emissiveMap = null;
			child.material = mat;
		}
	});
	openDoor.visible = false; scene.add(openDoor);

	const closedDoorOutline = doorModel.clone();
	closedDoorOutline.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.material = new THREE.MeshBasicMaterial({
				color: 0x8cc9ff,
				transparent: true,
				opacity: 0.65,
				side: THREE.BackSide,
			});
		}
	});
	closedDoorOutline.scale.multiplyScalar(1.03);
	closedDoorOutline.visible = false;
	scene.add(closedDoorOutline);

	const openDoorOutline = doorModel.clone();
	openDoorOutline.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.material = new THREE.MeshBasicMaterial({
				color: 0xff93dc,
				transparent: true,
				opacity: 0.65,
				side: THREE.BackSide,
			});
		}
	});
	openDoorOutline.scale.multiplyScalar(1.03);
	openDoorOutline.visible = false;
	scene.add(openDoorOutline);

	const escapeStarU: GlowUniforms = {
		uCol: new THREE.Uniform(new THREE.Color(1.0, 0.97, 0.92)),
		uPulse: new THREE.Uniform(1.0),
	};
	const escapeStar = new THREE.Mesh(
		new THREE.SphereGeometry(0.45, 24, 16),
		new THREE.ShaderMaterial({
			vertexShader: frVert,
			fragmentShader: glowFrag,
			uniforms: escapeStarU as any,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
		}),
	);
	escapeStar.visible = false;
	scene.add(escapeStar);

	// Environment
	const cageU: CageUniforms = { uTime: new THREE.Uniform(0.0), uInten: new THREE.Uniform(0.0), uCol: new THREE.Uniform(new THREE.Color(0x1a3acc)) };
	const cageMesh = new THREE.Mesh(
		createCylGeo(CAGE_R, CAGE_LEN, 72, 260),
		new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: cageFrag, uniforms: cageU as any, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
	);
	cageMesh.visible = false; scene.add(cageMesh);

    // INCREASED to 15,000 for extreme suction phase
	const stars = createStarField(15000, CAGE_R + 1, 80, CAGE_LEN, (r) => r < 0.5 ? [0.72, 0.82, 1.0] : r < 0.8 ? [0.96, 0.96, 0.99] : [1.0, 0.88, 0.62], [0.28, 2.2]); scene.add(stars);
	const nebula = createStarField(5000, 8, CAGE_R - 1, CAGE_LEN, (r) => r < 0.5 ? [0.06, 0.18, 0.42] : [0.22, 0.04, 0.32], [0.9, 3.5]); scene.add(nebula);

	const trails: TrailObject[] = Array.from({ length: TRAIL_N }, (_, i) => new TrailObject(i));
	for (const t of trails) t.addToScene(scene);

	const threatGlowU: GlowUniforms[] = [];
	const threats: THREE.Mesh[] = Array.from({ length: 8 }, (_, i) => {
		const gu: GlowUniforms = { uCol: new THREE.Uniform(new THREE.Color(0xcc6600)), uPulse: new THREE.Uniform(1.0) }; threatGlowU.push(gu);
		const m = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.45, 14, 10), new THREE.ShaderMaterial({ vertexShader: frVert, fragmentShader: glowFrag, uniforms: gu as any, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		m.userData = { spd: 0.35 + Math.random() * 0.65, rad: 2.2 + Math.random() * 2.8, ph: Math.random() * Math.PI * 2, off: 14 + i * 18 }; m.visible = false; scene.add(m); return m;
	});

	const _onResize = () => { composer.setSize(window.innerWidth, window.innerHeight); };
	window.addEventListener("resize", _onResize);

	const debugInput = { pitch: 0, roll: 0, accel: false, brake: false, active: false, phase: null as number | null };
	
	const _onKeyDown = (e: KeyboardEvent) => {
		const key = e.key.toLowerCase();
		if (stateRef) stateRef.keys.add(key);
		
		switch (e.code) {
			case "KeyW":
			case "ArrowUp":
				debugInput.pitch = -25;
				debugInput.active = true;
				break;
			case "KeyS":
			case "ArrowDown":
				debugInput.pitch = 25;
				debugInput.active = true;
				break;
			case "KeyA":
			case "ArrowLeft":
				debugInput.roll = 0;
				break;
			case "KeyD":
			case "ArrowRight":
				debugInput.roll = 0;
				break;
			case "Space":
				debugInput.accel = true;
				debugInput.active = true;
				break;
			case "Digit1":
				debugInput.phase = 1; 
				break;
			case "Digit2":
				debugInput.phase = 2; 
				break;
			case "Digit3":
				debugInput.phase = 3; 
				break;
		}
	};
	const _onKeyUp = (e: KeyboardEvent) => {
		const key = e.key.toLowerCase();
		if (stateRef) stateRef.keys.delete(key);
		
		switch (e.code) {
			case "KeyW":
			case "ArrowUp":
			case "KeyS":
			case "ArrowDown":
				debugInput.pitch = 0;
				break;
			case "KeyA":
			case "ArrowLeft":
			case "KeyD":
			case "ArrowRight":
				debugInput.roll = 0;
				break;
			case "Space":
				debugInput.accel = false;
				break;
		}
	};
	window.addEventListener("keydown", _onKeyDown);
	window.addEventListener("keyup", _onKeyUp);
	window.addEventListener("mousemove", _onMouseMove);
	renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6;

	const state = {
		scene, renderer, camera, phase: 0, phaseT: 0, camZ: -2, camPos: new THREE.Vector3(0, 0, -2), heading: 0, lateralX: 0, currentSpeed: 0,
		delayedPitch: 0, delayedRoll: 0, tunnelSpeed: 0.28, baseSpeed: 5, phaseDuration: 60, bendSpeed: 0.005,
		orientation: { pitch: 0, roll: 0 }, speed: { accelerate: false, brake: false }, dominantEye: null,
		keys: new Set<string>(),
		moveVel: new THREE.Vector3(0, 0, 0),
		lookYaw: 0,
		lookPitch: 0,
		postfxComposer: composer, postfxRender, blesserEffect, postfxDeltaRef, postCA: 0.14, postWarp: 0, postFlick: 0, hbPulse: 0, tunnelReveal: 0,
		tunnelMesh, tunnelU, tunnelLight, tunnelHalo, tunnelHaloU,
		tunnelCurve, tunnelFrames, tunnelProgress: 0,
		tunnelParticles, tunnelParticleMat, tunnelFog, tunnelFogMat,
		colorTex, aoTex, heightTex, normalTex,
		closedDoor, openDoor, closedDoorOutline, openDoorOutline, escapeStar, escapeStarU,
		room, roomLightL, roomLightR, roomBackLight,
		cageMesh, cageU, stars, nebula, trails, trailSc: 1, threats, threatGlowU, _onResize,
		debugInput,
		_onKeyDown, _onKeyUp, _onMouseMove,
	};
	
	stateRef = state;
	return state;
}

// ═══════════════════════════════════════════════════════════════════════
//  TICK
// ═══════════════════════════════════════════════════════════════════════
const _tmpColor = new THREE.Color();

export function tick(state: ExperienceState, ctx: TickContext): { state: ExperienceState } {
    const s = state as B4LesserState;
    const { delta, elapsed } = ctx;

    s.phaseT += delta;
    s.postfxDeltaRef.value = delta;
    const L = Math.min(1, delta * 1.5);

    // ── Post-FX Progression ──
    let tCA = 0.14, tWarp = 0.0, tFlick = 0.0;
    let tScan = 0.0, tVhs = 0.0, tGlitch = 0.0, tWhiteout = 0.0;
    
    if (s.phase === 0) {
        const pull = THREE.MathUtils.smoothstep(s.phaseT, 0.4, 5.2);
        const depth = s.tunnelProgress;
        tCA = 0.18 + pull * 1.35 + depth * 0.35;
        tWarp = 0.1 + pull * 1.45 + depth * 0.6;
        tScan = 0.22 + pull * 0.35;
        tVhs = 0.2 + pull * 0.25;
        tGlitch = 0.3 + pull * 0.35;
    } else if (s.phase === 1) {
        // EXTREME SUCTION OVERRIDE
        tCA = 3.5; 
        tWarp = 0.95 + Math.sin(elapsed * 1.5) * 0.45; 
        tScan = 0.0;
        tVhs = 0.0;
        tGlitch = 0.0;
    } else if (s.phase === 2) {
        tCA = 0.12;
        tWarp = 0.0; 
        tScan = 0.18;
        tVhs = 0.12;
        tGlitch = 0.25;
    } else if (s.phase === 3) {
        const swallow = Math.min(1.0, s.phaseT / 3.0);
        tCA = 2.5 + swallow * 4.0; 
        tWarp = 1.8 + swallow * 2.5;  
        tScan = 0.4 + swallow * 0.8;
        tVhs = 0.2 + swallow * 0.6;
        tGlitch = 0.15 + swallow * 0.4;
        tWhiteout = THREE.MathUtils.smoothstep(swallow, 0.5, 1.0); 
    }

    s.postCA += (tCA - s.postCA) * L;
    
    const warpLerp = s.phase === 1 ? L * 3.0 : L * 0.55;
    s.postWarp += (tWarp - s.postWarp) * warpLerp;
    
    s.postFlick += (tFlick - s.postFlick) * L;

    const hbRaw = Math.pow(Math.max(0, Math.sin(elapsed * Math.PI * 1.15 - 0.2)), 10.0);
    s.hbPulse += (hbRaw - s.hbPulse) * Math.min(1, delta * 18);
    
    s.blesserEffect.setCA(s.postCA); 
    s.blesserEffect.setWarp(s.postWarp); 
    s.blesserEffect.setFlicker(s.postFlick); 
    s.blesserEffect.setTime(elapsed * 100);
    s.blesserEffect.setScan(tScan); 
    s.blesserEffect.setVhs(tVhs); 
    s.blesserEffect.setGlitch(tGlitch);
    
    const domEye = s.dominantEye !== "left" ? 1 : 0;
    s.blesserEffect.setDomEye(domEye);
    s.blesserEffect.setNonDomVig(s.phase === 2 && s.renderer.xr.isPresenting ? 0.12 : 0.0);
    s.blesserEffect.setWhiteout(tWhiteout);
    s.blesserEffect.setHeartbeat(s.phase === 0 ? s.hbPulse * Math.max(0, 1.2 - s.tunnelReveal * 2.0) : 0);

    const fogTargets = [
        { density: 0.014, hex: 0x05000c }, { density: 0.005, hex: 0x010316 }, { density: 0.004, hex: 0x010218 },
    ];
    const ft = fogTargets[s.phase] ?? fogTargets[0];
    const fog = s.scene.fog as THREE.FogExp2;
    _tmpColor.setHex(ft.hex); 
    fog.color.lerp(_tmpColor, delta * 0.5); 
    fog.density += (ft.density - fog.density) * delta * 0.8;

    let pitch = s.orientation.pitch;
    let roll = s.orientation.roll;
    let accelerate = s.speed.accelerate;
    let brake = s.speed.brake;

    if (s.debugInput.active && Math.abs(pitch) + Math.abs(roll) < 0.01) {
        pitch = s.debugInput.pitch;
        roll = s.debugInput.roll;
        accelerate = s.debugInput.accel;
        brake = s.debugInput.brake;
    }
    if (s.debugInput.phase !== null) {
        const p = s.debugInput.phase;
        s.debugInput.phase = null;
        s.phase = p;
        s.phaseT = 0;
        if (p === 0) {
            s.tunnelProgress = 0;
            s.camPos.set(0, 0, -2);
            s.camZ = -2;
        } else if (p === 1) {
            s.camPos.set(0, 0, 0);
            s.camZ = 0;
        } else if (p === 2) {
            s.camPos.set(0, 0, 0);
            s.camZ = 0;
        }
    }
    
    function applyMovement(s: B4LesserState, delta: number): void {
        if (s.phase !== 0) return; 

        const baseSpeed = s.keys.has("shift") ? 24 : 10;
        const accel = 18.0;
        const damping = 0.88;

        const input = new THREE.Vector3(0, 0, 0);
        // FIXED: W pushes you forward, S pulls you back
        if (s.keys.has("w")) input.z += 1;
        if (s.keys.has("s")) input.z -= 1;
        if (input.lengthSq() > 0) input.normalize();

        s.moveVel.addScaledVector(input, accel * delta * baseSpeed);
        s.moveVel.multiplyScalar(damping);

        // FIXED: Locked mouse look Euler order to YXZ to stop camera roll
        const euler = new THREE.Euler(s.lookPitch, s.lookYaw, 0, 'YXZ');
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(euler);
        s.camera.position.addScaledVector(forward, s.moveVel.z * delta);
        s.camera.lookAt(s.camera.position.clone().add(forward));

        const z = s.camera.position.z;
        const t = Math.max(0.01, Math.min(0.99, -z / TUNNEL_LEN));
        const cp = s.tunnelCurve.getPointAt(t);

        s.camera.position.x += (cp.x - s.camera.position.x) * 0.03;
        s.camera.position.y += (cp.y - s.camera.position.y) * 0.03;

        const dx = s.camera.position.x - cp.x;
        const dy = s.camera.position.y - cp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = 5.5;
        if (dist > maxRadius) {
            const pushX = cp.x + (dx / dist) * maxRadius;
            const pushY = cp.y + (dy / dist) * maxRadius;
            s.camera.position.x = pushX;
            s.camera.position.y = pushY;
        }

        s.camera.position.z = THREE.MathUtils.clamp(s.camera.position.z, -TUNNEL_LEN, 0);
        s.camZ = s.camera.position.z;
        s.camPos.copy(s.camera.position);
    }
    
    applyMovement(s, delta);
    
    let bobX = Math.sin(elapsed * 0.43) * 0.22;
    let bobY = Math.cos(elapsed * 0.37) * 0.28;

    const targetSpd = s.baseSpeed * (accelerate ? 2.0 : brake ? 0.3 : 1.0);

    if (s.phase === 0) {
        const z = s.camera.position.z;
        s.tunnelProgress = Math.min(1, Math.max(0, -z / TUNNEL_LEN));
        const lateral = roll * 1.7;

        const pull = THREE.MathUtils.smoothstep(s.phaseT, 0.4, 5.2);
        const fovTarget = 86 + pull * 24;
        s.camera.fov += (fovTarget - s.camera.fov) * delta * 2.2;
        s.camera.updateProjectionMatrix();

        s.renderer.toneMappingExposure += (1.1 - s.renderer.toneMappingExposure) * delta * 0.5;

        if (s.tunnelProgress >= 1) {
            s.dominantEye = lateral < 0 ? "left" : "right";
            s.phase = 1; s.phaseT = 0; s.camPos.copy(s.camera.position);
        }
    } else if (s.phase === 1) {
        s.camera.position.set(0, 0, 0);
        s.camera.lookAt(0, 0, -1); 
        
        // Massive speed boost for the suction effect
        const starSpeed = 350 * delta;
        [s.stars, s.nebula].forEach(mesh => {
            if (mesh && mesh.visible) {
                const positions = mesh.geometry.attributes.position.array as Float32Array;
                for (let i = 0; i < positions.length / 3; i++) {
                    positions[i * 3 + 2] += starSpeed;
                    if (positions[i * 3 + 2] > 10) {
                        positions[i * 3 + 2] -= 400; 
                    }
                }
                mesh.geometry.attributes.position.needsUpdate = true;
            }
        });
        
        s.tunnelReveal = 0.0;
        
        if (s.phaseT >= 8.0) {
            s.phase = 2; s.phaseT = 0;
            s.camera.fov = 86;
            s.camPos.set(0, 0, 0);
            s.camZ = 0;
        }
    } else if (s.phase === 2) {
        const DEG2RAD = Math.PI / 180;
        let sysInf = s.phase === 2 ? Math.min(1, s.phaseT / 30) : 0;
        const forcedRoll = Math.sin(elapsed * 0.08) * 15 * sysInf;
        const blendRoll = roll * (1 - sysInf * 0.8) + forcedRoll;
        const blendPitch = pitch * (1 - sysInf * 0.5);

        s.heading -= blendRoll * (DEG2RAD * 1.5) * delta;
        s.currentSpeed += (targetSpd - s.currentSpeed) * delta * 1.2;
        s.camPos.x += Math.sin(s.heading) * s.currentSpeed * delta;
        s.camPos.z += Math.cos(s.heading) * s.currentSpeed * delta;
        s.camPos.y -= blendPitch * DEG2RAD * s.currentSpeed * 0.5 * delta;
        s.camZ = s.camPos.z;

        const wPull = s.phase === 2 ? s.postWarp * Math.sin(elapsed * 0.55) * 3.8 : 0;
        const phase2Pos = new THREE.Vector3(s.camPos.x + bobX, s.camPos.y + bobY, s.camPos.z);
        s.camera.position.copy(phase2Pos);
        s.camera.lookAt(phase2Pos.x + Math.sin(s.heading) * 22 + wPull, phase2Pos.y + blendPitch * 9 + bobY * 2, phase2Pos.z + Math.cos(s.heading) * 22);

        const tFov = 86 + (s.phase === 2 ? s.postWarp * 35 : 0);
        s.camera.fov += (tFov - s.camera.fov) * delta * 1.8;
        s.camera.updateProjectionMatrix();
    } else if (s.phase === 3) {
        const swallowProgress = Math.min(1.0, s.phaseT / 3.0);
        
        const dominant = s.dominantEye ?? "right";
        const doorPos = new THREE.Vector3(dominant === "right" ? 6 : -6, 0, 42);
        const throughDoor = doorPos.clone().add(new THREE.Vector3(0, 0, 8 + swallowProgress * 20));
        
        const pullSpeed = 2.5 + swallowProgress * swallowProgress * 10; 
        s.camPos.lerp(throughDoor, Math.min(1, delta * pullSpeed));
        s.camera.position.copy(s.camPos);
        s.camera.lookAt(throughDoor.x, throughDoor.y, throughDoor.z + 10);
        
        const fovTarget = 86 + swallowProgress * 40;
        s.camera.fov += (fovTarget - s.camera.fov) * delta * 6;
        s.camera.updateProjectionMatrix();
        
        s.camZ = s.camera.position.z;
    }

// ── Geometry Visibility & Updates ──
const showTunnel = s.phase === 0;
s.tunnelMesh.visible = showTunnel;
s.tunnelHalo.visible = showTunnel;
s.tunnelParticles.visible = showTunnel;
for (const fog of s.tunnelFog) fog.visible = showTunnel;
    if (showTunnel) {
        if (s.phase === 0) {
            const sparkle = THREE.MathUtils.smoothstep(s.phaseT, 0.05, 1.15);
            const canal = THREE.MathUtils.smoothstep(s.phaseT, 0.35, 2.1);
            s.tunnelReveal = canal;
            s.tunnelParticleMat.opacity = 0.16 + sparkle * 1.15;
            for (const fog of s.tunnelFog) {
                const mat = fog.material as THREE.Material;
                mat.opacity = 0.15 + canal * 0.65;
            }
            s.tunnelMesh.visible = true;
        } else if (s.phase === 1) {
            const pull = THREE.MathUtils.smoothstep(s.phaseT, 0.0, 2.0);
            s.tunnelReveal = Math.max(0.0, 0.2 - pull * 0.3);
            s.tunnelParticleMat.opacity = 0.0;
        }
    s.tunnelU.uTime.value = elapsed;
    s.tunnelU.uGlowIntensity.value = 0.24 + s.tunnelReveal * 1.25;
    s.tunnelU.uWaveAmp.value = 0.18 + s.tunnelReveal * 0.55;
    s.tunnelU.uPulse.value = (Math.sin(elapsed * 0.8) * 0.5 + 0.5) * (0.18 + s.tunnelReveal * 0.35);
    
    s.tunnelLight.position.copy(s.camera.position);
    s.tunnelParticleMat.uniforms.uTime.value = elapsed;
    for (let i = 0; i < s.tunnelFog.length; i++) {
        const fogMat = s.tunnelFogMat[i];
        fogMat.uniforms.uTime.value = elapsed + (s.tunnelFog[i].userData.offset as number);
    }

    s.tunnelHaloU.uTime.value = elapsed;
    s.tunnelHaloU.uDrift.value = 0.12 + Math.sin(elapsed * 0.3) * 0.03;
    s.tunnelHaloU.uIntensity.value = 0.02 + s.tunnelReveal * 0.35;
    }

    if (s.phase === 2) {
        if (s.renderer.xr.isPresenting) {
            const xrCam = s.renderer.xr.getCamera() as THREE.ArrayCamera;
            if (xrCam.cameras && xrCam.cameras.length === 2) {
                const left = xrCam.cameras[0], right = xrCam.cameras[1];
                left.layers.enable(0); left.layers.enable(1); left.layers.disable(2);
                right.layers.enable(0); right.layers.disable(1); right.layers.enable(2);
            }
        } else { s.camera.layers.enableAll(); }
    } else if (!s.renderer.xr.isPresenting) { s.camera.layers.enable(0); }

const showCage = false;
const showStars = s.phase === 1; 
s.cageMesh.visible = showCage; 
s.stars.visible = showStars; 
s.nebula.visible = showStars;
    if (showCage) {
        s.cageMesh.position.set(0, 0, s.camZ - 80); s.cageU.uTime.value = elapsed;
    }
    if (showStars) {
        s.stars.position.set(0, 0, 0); 
        s.nebula.position.set(0, 0, 0);
        (s.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
        (s.nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    }

    const trailScTarget = 1.0;
    s.trailSc += (trailScTarget - s.trailSc) * L;
    const showTrails = false;
    for (const tr of s.trails) {
        if (showTrails) tr.update(elapsed, s.camZ, true, s.trailSc);
        else tr.hide();
    }

const showThreats = false;
s.threats.forEach((t, i) => {
        t.visible = showThreats;
        if (showThreats) {
            const d = t.userData as { spd: number; rad: number; ph: number; off: number };
            const a = elapsed * d.spd + d.ph;
            t.position.set(Math.cos(a) * d.rad, Math.sin(a * 1.38) * d.rad * 0.75, s.camZ + d.off);
            s.threatGlowU[i].uPulse.value = 0.7 + Math.sin(elapsed * 3.5 + i) * 0.35;
        }
});

// ── Room + doors (Phase 2) ─────────────────────────────────────
const showRoom = s.phase === 2 || s.phase === 3;
s.room.visible = showRoom;
s.closedDoor.visible = showRoom;
s.openDoor.visible = showRoom;
s.closedDoorOutline.visible = showRoom;
s.openDoorOutline.visible = showRoom;

s.roomLightL.visible = showRoom;
s.roomLightR.visible = showRoom;
s.roomBackLight.visible = showRoom;
s.escapeStar.visible = false;

if (showRoom) {
    s.room.position.set(0, 0, 20);
    const doorZ = 20 + 22;
    s.closedDoor.position.set(-6, 0, doorZ);
    s.openDoor.position.set(6, 0, doorZ);
    s.closedDoorOutline.position.copy(s.closedDoor.position);
    s.openDoorOutline.position.copy(s.openDoor.position);
    
    const dominant = s.dominantEye ?? "right";
    const domLayer = dominant === "left" ? 1 : 2;
    const nonDomLayer = dominant === "left" ? 2 : 1;
    
    s.closedDoor.layers.set(domLayer);
    s.openDoor.layers.set(nonDomLayer);
    s.closedDoorOutline.layers.set(domLayer);
    s.openDoorOutline.layers.set(nonDomLayer);
    
    if (s.phase === 2) {
        let moveVector = new THREE.Vector3(0, 0, 0);
        const roomSpeed = 6;
        if (s.keys.has("w")) moveVector.z += roomSpeed * delta;
        if (s.keys.has("s")) moveVector.z -= roomSpeed * delta;
        
        s.camPos.add(moveVector);
        const mid = new THREE.Vector3(0, 0, doorZ - 5);
        s.camPos.lerp(mid, delta * 0.25);
        s.camera.position.copy(s.camPos);
        
        const doorPos = new THREE.Vector3((s.dominantEye === "right" ? 6 : -6), 0, doorZ);
        if (s.phaseT > 7.0) {
            const pullStrength = Math.min(1.0, (s.phaseT - 7.0) * 0.08);
            const pullDir = doorPos.clone().sub(s.camera.position).normalize();
            s.camPos.add(pullDir.multiplyScalar(pullStrength * 2.5 * delta));
        }
        
        if (s.camera.position.distanceTo(doorPos) < 1.8) {
            s.phase = 3;
            s.phaseT = 0;
        }
    }
}

    return { state: s };
}

// ═══════════════════════════════════════════════════════════════════════
//  DISPOSE
// ═══════════════════════════════════════════════════════════════════════

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
	const s = state as B4LesserState;
	window.removeEventListener("resize", s._onResize);
	window.removeEventListener("keydown", s._onKeyDown);
	window.removeEventListener("keyup", s._onKeyUp);
	window.removeEventListener("mousemove", s._onMouseMove);
	s.postfxComposer.dispose();

	const disposeObject = (obj: THREE.Object3D) => {
		obj.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
				else child.material.dispose();
			}
		});
		scene.remove(obj);
	};
	[s.tunnelMesh, s.tunnelHalo, s.tunnelParticles, s.cageMesh, s.stars, s.nebula, s.closedDoor, s.openDoor, s.escapeStar, s.room].forEach(disposeObject);
	
    scene.remove(s.tunnelLight); s.tunnelLight.dispose();
    scene.remove(s.roomLightL); s.roomLightL.dispose();
    scene.remove(s.roomLightR); s.roomLightR.dispose();
    scene.remove(s.roomBackLight); s.roomBackLight.dispose();
    
    if (s.colorTex) s.colorTex.dispose();
    if (s.aoTex) s.aoTex.dispose();
    if (s.heightTex) s.heightTex.dispose();
    if (s.normalTex) s.normalTex.dispose();

	for (const child of [...scene.children]) {
		if (child instanceof THREE.AmbientLight) scene.remove(child);
	}

	for (const fog of s.tunnelFog) {
		fog.geometry.dispose();
		(fog.material as THREE.Material).dispose();
		scene.remove(fog);
	}

	for (const t of s.trails) { t.dispose(); scene.remove(t.dot, t.pPts, t.fPts); }
	for (const t of s.threats) { t.geometry.geometry.dispose(); (t.material as THREE.Material).dispose(); scene.remove(t); }
}