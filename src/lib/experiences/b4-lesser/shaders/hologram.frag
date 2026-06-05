uniform float uTime;
uniform vec3 uColor;
uniform float uEdge;
uniform float uAlpha;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vViewDir);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
  float scan = sin((vWorldPos.y + uTime * 0.4) * 12.0) * 0.5 + 0.5;
  float pulse = 0.7 + 0.3 * sin(uTime * 1.6 + vWorldPos.x * 0.2);

  float edge = fresnel * uEdge;
  float alpha = edge * uAlpha * (0.6 + scan * 0.4);
  vec3 col = uColor * (0.25 + edge * 1.2) + uColor * 0.15 * scan;
  col *= pulse;

  gl_FragColor = vec4(col, alpha);
}
