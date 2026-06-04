uniform float uTime;
uniform vec3 uBase;
uniform vec3 uGlowA;
uniform vec3 uGlowB;
uniform vec3 uAccent;
uniform float uGlowIntensity;
uniform float uPulse;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vDisplacement;

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
  for (int i = 0; i < 5; i++) {
    v += a * noise3D(p);
    p = p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 p = vWorldPosition;

  float n1 = fbm(p * 0.08 + vec3(uTime * 0.25, uTime * 0.2, uTime * 0.3));
  float n2 = fbm(p * 0.15 + vec3(uTime * 0.2, uTime * 0.15, 0.0));
  float n3 = fbm(p * 0.25 + vec3(0.0, uTime * 0.25, uTime * 0.2));

  float pulse1 = sin(uTime * 3.0 + n1 * 8.0 + p.z * 0.3) * 0.5 + 0.5;
  float pulse2 = sin(uTime * 2.5 + n2 * 6.0 + p.x * 0.35) * 0.5 + 0.5;
  float pulse3 = cos(uTime * 3.5 + n3 * 7.0 + p.y * 0.3) * 0.5 + 0.5;
  float pulseMix = pulse1 * pulse2 * pulse3 * (0.7 + uPulse * 0.6);

  float glow = smoothstep(0.2, 0.95, n1 * n2 * pulse1 + n3 * 0.4);

  float wave1 = sin(p.z * 0.4 + n1 * 12.0 + uTime * 3.0) * 0.5 + 0.5;
  float wave2 = sin(p.z * 0.25 + p.x * 0.5 + n2 * 10.0 + uTime * 2.5) * 0.5 + 0.5;
  float wave3 = cos(p.y * 0.35 + n3 * 8.0 + uTime * 2.8) * 0.5 + 0.5;
  float wavePattern = wave1 * wave2 * wave3;
  glow = mix(glow, glow * wavePattern * pulseMix, 0.85);

  // Swirl stripes along the tunnel length (twist feeling)
  float swirl = sin(uTime * 0.6 + vUv.y * 12.0 + n2 * 2.0) * 0.5 + 0.5;
  float colorMix = mix(wavePattern, swirl, 0.6);
  vec3 colorVariation = mix(mix(uGlowA, uGlowB, colorMix), uAccent, colorMix * 0.5);

  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.2);
  vec3 color = mix(uBase, colorVariation, glow * uGlowIntensity);
  color = mix(color, colorVariation * 1.6, fresnel * 0.6);
  color *= 0.28 + pulseMix * 0.85;

  gl_FragColor = vec4(pow(color, vec3(0.82)), 1.0);
}
