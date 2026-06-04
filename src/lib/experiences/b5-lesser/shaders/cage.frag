// Digital cage — grid lines with data pulse
varying vec3 vN;
varying vec3 vVP;
varying vec2 vUv;

uniform float uTime;
uniform float uInten;
uniform vec3  uCol;

void main() {
  float fr = pow(1.0 - abs(dot(normalize(vVP), normalize(vN))), 3.0);

  float bu = min(fract(vUv.x * 32.0), 1.0 - fract(vUv.x * 32.0));
  float bv = min(fract(vUv.y * 58.0), 1.0 - fract(vUv.y * 58.0));

  float bar  = 1.0 - smoothstep(0.0, 0.075, bu);
  float band = 1.0 - smoothstep(0.0, 0.058, bv);
  float node = bar * band;
  float grid = max(bar, band);

  float pulse = sin(uTime * 0.65 + vUv.y * 4.5) * 0.17 + 0.83;
  // Data packet running up the bars
  float data  = smoothstep(0.0, 0.04, fract(vUv.y - uTime * 0.11)) * bar * 0.45;

  vec3 col = uCol * (grid * 0.72 + node * 0.55 + fr * 0.3 + data) * pulse * (0.42 + uInten * 0.88);
  float a  = clamp((grid * 0.58 + node * 0.38 + fr * 0.16) * (0.28 + uInten * 0.72), 0.0, 1.0);

  gl_FragColor = vec4(col, a);
}
