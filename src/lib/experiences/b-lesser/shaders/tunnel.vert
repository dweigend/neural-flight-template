uniform float uTime;
uniform float uWaveAmp;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vDisplacement;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec3 pos = position;

  float wave1 = sin(pos.z * 0.06 + uTime * 2.0) * uWaveAmp;
  float wave2 = sin(pos.z * 0.03 + uTime * 1.5) * uWaveAmp * 0.5;
  float wave3 = cos(pos.z * 0.08 + uTime * 1.0) * uWaveAmp * 0.3;
  float radialWave = sin(length(pos.xy) * 0.2 + uTime * 2.5) * uWaveAmp * 0.25;

  pos += normal * radialWave;
  vDisplacement = wave1 + wave2 + wave3 + radialWave;

  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
