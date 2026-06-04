import * as THREE from "three";

export const NOISE_GLSL = `
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
uniform float uPeriStrength;
uniform float uVoidReveal;
uniform float uNearEnd;
uniform float uFarEnd;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;

${NOISE_GLSL}

void main() {
  vUv = uv; vZ = position.z; float t = uTime;
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
  float vib = sin(t * 2.0 + position.z * 1.5) * 0.25;
  float peristalsis = (g1 * 0.8 + g2 * 0.5 + g3 * 0.4 + g4 * 0.3) * 0.6 + vib;
  vPeri = peristalsis;
  float noiseD = n * 0.3;
  float totalD = (crossMod - 1.0) + (peristalsis + noiseD) * uPeriStrength;
  totalD = max(totalD, -3.0);
  float bendX = sin(position.z * 0.015) * 2.0;
  float bendY = cos(position.z * 0.01) * 1.2;
  vec3 p = position;
  p.x *= taper; p.y *= taper;
  p += normal * totalD * taper;
  p.x += bendX; p.y += bendY;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const CANAL_FRAGMENT = `
uniform float uTime;
uniform float uPeriStrength;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform sampler2D uDiffuse;
uniform float uTexBlend;
uniform float uLightZ;
uniform float uBright;
uniform float uVoidReveal;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;
${NOISE_GLSL}

void main() {
  float t = uTime;
  float wave1 = 0.5 + 0.5 * sin(vZ * 0.06 + t * 0.4);
  float wave2 = 0.5 + 0.5 * sin(vZ * 0.1 - t * 0.6);
  float wave3 = 0.5 + 0.5 * sin(vZ * 0.15 + t * 0.25 + vUv.x * 2.0);
  float pulse = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;
  float n = fbm(vec3(vUv * 3.0, t * 0.04));
  float n2 = fbm(vec3(vUv.yx * 5.0, t * 0.06 + 10.0));
  vec3 col = mix(uColor2, uColor1, pulse * 0.6 + n * 0.4);
  col += uColor3 * n2 * 0.06 * pulse;
  vec4 tex = texture2D(uDiffuse, vUv * 3.0);
  col = mix(col, col * (tex.rgb * 1.4), uTexBlend);
  col *= 0.55;
  col += vec3(0.8, 0.1, 0.25) * 0.12;
  col += vec3(1.0, 0.2, 0.4) * vPeri * 0.4;
  float dz = vZ - uLightZ;
  float lightGlow = exp(-dz * dz * 0.008) * 0.2;
  col += vec3(1.0, 0.5, 0.2) * lightGlow;
  float mistN = fbm(vec3(vUv * 1.5, t * 0.02));
  float mist2 = fbm(vec3(vZ * 0.02 + vUv.x * 0.5, vUv.y * 2.0, t * 0.03));
  float mist = mistN * 0.4 + mist2 * 0.35;
  mist = clamp(mist, 0.0, 0.75);
  col += vec3(0.9, 0.12, 0.35) * mist;
  float depthHaze = exp(-abs(vZ + 20.0) * 0.01) * 0.2;
  col += vec3(0.6, 0.08, 0.2) * depthHaze;
  col *= 0.92 + 0.08 * sin(t * 0.15 + vZ * 0.03);
  col *= uVoidReveal;
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
			uPeriStrength: { value: 1 },
			uNearEnd: { value: 10 },
			uFarEnd: { value: -690 },
			uColor1: { value: new THREE.Color(0.2, 0.02, 0.05) },
			uColor2: { value: new THREE.Color(0.12, 0.01, 0.03) },
			uColor3: { value: new THREE.Color(0.3, 0.04, 0.1) },
			uDiffuse: { value: null },
			uTexBlend: { value: 0.8 },
			uLightZ: { value: 0 },
			uBright: { value: 1.0 },
			uVoidReveal: { value: 0.0 },
		},
	});
}
