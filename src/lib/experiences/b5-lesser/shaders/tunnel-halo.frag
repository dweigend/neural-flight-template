uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;

varying vec2 vUv;
varying vec3 vWorldPosition;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), f.x),
        mix(dot(hash33(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash33(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dot(hash33(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash33(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), f.x),
        mix(dot(hash33(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash33(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3D(p);
    p = p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 p = vWorldPosition;
  float n = fbm(p * 0.1 + vec3(uTime * 0.06, uTime * 0.09, uTime * 0.07));
  float veil = smoothstep(0.28, 0.9, n);
  float band = smoothstep(0.2, 0.8, fbm(p * 0.18 + vec3(uTime * 0.1)));
  float glow = veil * (0.55 + band * 0.45) * uIntensity;

  vec3 col = mix(uColorA, uColorB, band) * glow;
  gl_FragColor = vec4(col, glow * 0.45);
}
