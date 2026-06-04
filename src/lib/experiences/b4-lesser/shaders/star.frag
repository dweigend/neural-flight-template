varying vec3  vC;
varying float vTw;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - smoothstep(0.2, 1.0, d)), 3.0) * vTw;
  if (a < 0.007) discard;
  gl_FragColor = vec4(vC, a);
}
