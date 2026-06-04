uniform float uTime;
uniform float uDrift;

varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec3 pos = position;
  pos.xy += vec2(
    sin(uTime * 0.2 + pos.z * 0.02) * uDrift,
    cos(uTime * 0.17 + pos.z * 0.03) * uDrift
  );
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
