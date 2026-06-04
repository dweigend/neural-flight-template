// Twinkle star — phase-offset brightness flicker
attribute float aSz;
attribute float aPh;
attribute vec3  aCol;
varying   vec3  vC;
varying   float vTw;

uniform float uTime;

void main() {
  vC  = aCol;
  vTw = sin(uTime * 2.9 + aPh) * 0.35 + 0.65;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSz * vTw * (190.0 / -mv.z);
  gl_Position  = projectionMatrix * mv;
}
