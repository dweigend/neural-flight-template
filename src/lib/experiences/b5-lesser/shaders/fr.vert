// Shared vertex shader — provides Fresnel (vN, vVP) + UV
varying vec3 vN;
varying vec3 vVP;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVP = -mv.xyz;
  vN  = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
