varying vec3 vC;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.5);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC * (a * 0.65 + 0.35), a);
}
