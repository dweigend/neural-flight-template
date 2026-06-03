import * as THREE from "three";
import type { ShaderMaterial } from "three";

const NOISE_GLSL = `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec3(1,0,0));
  float c = hash(i + vec3(0,1,0)); float d = hash(i + vec3(1,1,0));
  float e = hash(i + vec3(0,0,1)); float f_ = hash(i + vec3(1,0,1));
  float g = hash(i + vec3(0,1,1)); float h = hash(i + vec3(1,1,1));
  float mix1 = mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  float mix2 = mix(mix(e,f_,f.x), mix(g,h,f.x), f.y);
  return mix(mix1,mix2,f.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p); p = p * 2.0 + shift; a *= 0.5;
  }
  return v;
}
`;

const CANAL_VERTEX = `
uniform float uTime;
uniform float uReveal;
uniform float uPeriStrength;
uniform float uNearEnd;
uniform float uFarEnd;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;

${NOISE_GLSL}

void main() {
  vUv = uv;
  vZ = position.z;
  float t = uTime;

  // Taper ends to near-zero so no black void visible
  float taperLen = 50.0;
  float dNear = vZ - uFarEnd;
  float dFar = uNearEnd - vZ;
  float taper = min(dNear / taperLen, 1.0);
  taper = min(taper, dFar / taperLen);
  taper = clamp(taper, 0.01, 1.0);

  float angle = atan(position.y, position.x);
  float crossMod = 1.0 + 0.12 * sin(angle * 3.0 + 0.5)
                        + 0.08 * cos(angle * 5.0 + 1.3)
                        + 0.05 * sin(angle * 7.0 + 2.1);

  float g1 = exp(-pow(sin(position.z * 0.06 + t * 0.25), 2.0) * 5.0);
  float g2 = exp(-pow(sin(position.z * 0.12 - t * 0.4), 2.0) * 7.0);
  float g3 = exp(-pow(sin(position.z * 0.03 + t * 0.15), 2.0) * 3.0);
  float g4 = exp(-pow(sin(position.z * 0.2 + t * 0.5 + position.x * 0.1), 2.0) * 10.0);

  float n = fbm(vec3(position.xy * 0.08, position.z * 0.04 + t * 0.08));
  vNoise = n;

  float vib = sin(t * 1.5 + position.z * 1.0) * 0.12;
  float peristalsis = (g1 * 0.8 + g2 * 0.5 + g3 * 0.4 + g4 * 0.3) * 0.6 + vib;
  vPeri = peristalsis;
  float noiseD = n * 0.15;
  float totalD = (crossMod - 1.0) + (peristalsis + noiseD) * uPeriStrength;

  vec3 p = position * taper;
  p += normal * totalD;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const CANAL_FRAGMENT = `
uniform float uTime;
uniform float uReveal;
uniform float uPeriStrength;
uniform float uPhase;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform sampler2D uDiffuse;
uniform float uTexBlend;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;
${NOISE_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPos);
  float fr = pow(1.0 - max(abs(dot(V, N)), 0.0), 2.5);
  float t = uTime;

  float wave1 = 0.5 + 0.5 * sin(vZ * 0.06 + t * 0.4);
  float wave2 = 0.5 + 0.5 * sin(vZ * 0.1 - t * 0.6);
  float wave3 = 0.5 + 0.5 * sin(vZ * 0.15 + t * 0.25 + vUv.x * 2.0);
  float pulse = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;

  float n = fbm(vec3(vUv * 3.0, t * 0.04));
  float n2 = fbm(vec3(vUv.yx * 5.0, t * 0.06 + 10.0));

  vec3 col = mix(uColor2, uColor1, pulse * 0.6 + n * 0.4);
  col += uColor3 * n2 * 0.06 * pulse;

  // Texture overlay — meat / flesh detail
  vec4 tex = texture2D(uDiffuse, vUv * 3.0);
  col = mix(col, col * (tex.rgb * 1.6), uTexBlend);

  // Walls visible with pink tone so peristalsis pumping shows
  col *= 0.7;
  col += vec3(1.0, 0.2, 0.4) * 0.15;

  // Spotted discoloration oscillating red / pink / purple (replaces smooth Gaussian bands)
  float spotN = fbm(vec3(vUv * 6.0, t * 0.12));
  float spot = pow(max(spotN - 0.5, 0.0) * 3.0, 2.0);
  float hue = 0.5 + 0.5 * sin(t * 0.3 + vZ * 0.08 + spotN * 6.0);
  vec3 spotColor = mix(vec3(0.9, 0.1, 0.15), vec3(1.0, 0.3, 0.6), hue);
  spotColor = mix(spotColor, vec3(0.6, 0.1, 0.7), 0.5 + 0.5 * cos(t * 0.25 + vZ * 0.06));
  col += spotColor * spot * 0.5;

  // Peristalsis pulse visible on walls
  col += vec3(1.0, 0.2, 0.4) * vPeri * 0.4;

  col *= 0.92 + 0.08 * sin(t * 0.15 + vZ * 0.03);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createCanalMaterial(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		side: THREE.BackSide,
		vertexShader: CANAL_VERTEX,
		fragmentShader: CANAL_FRAGMENT,
		uniforms: {
			uTime: { value: 0 },
			uReveal: { value: 0 },
			uPeriStrength: { value: 1 },
			uPhase: { value: 0 },
			uNearEnd: { value: 10 },
			uFarEnd: { value: -490 },
			uColor1: { value: new THREE.Color(0.20, 0.02, 0.05) },
			uColor2: { value: new THREE.Color(0.12, 0.01, 0.03) },
			uColor3: { value: new THREE.Color(0.30, 0.04, 0.10) },
			uDiffuse: { value: null },
			uTexBlend: { value: 0.6 },
		},
	});
}

const GLOW_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAGMENT = `
uniform vec3 uCol;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = distance(vUv, vec2(0.5)) * 2.0;
  float glow = exp(-d * d * 4.0);
  float pulse = 0.7 + 0.3 * sin(uTime * 0.5);
  float a = glow * pulse;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uCol * glow * 1.5, a);
}
`;

export function createGlowShapeMaterial(color: string): ShaderMaterial {
	return new THREE.ShaderMaterial({
		vertexShader: GLOW_VERTEX,
		fragmentShader: GLOW_FRAGMENT,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: {
			uCol: { value: new THREE.Color(color) },
			uTime: { value: 0 },
		},
	});
}
