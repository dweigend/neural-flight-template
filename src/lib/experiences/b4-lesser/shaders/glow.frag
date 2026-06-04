// Fresnel glow — used for symbols, threats, maw
varying vec3 vN;
varying vec3 vVP;

uniform vec3  uCol;
uniform float uPulse;

void main() {
  float fr = pow(1.0 - abs(dot(normalize(vVP), normalize(vN))), 2.6);
  gl_FragColor = vec4(uCol * (fr * 3.6 + 0.1) * uPulse, fr * 0.94 + 0.06);
}
