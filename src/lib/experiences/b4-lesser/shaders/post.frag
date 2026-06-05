// B.lesser full-screen post effect
// Used as a postprocessing Effect (mainImage format)
//
// Uniforms (custom):
//   uCA        — chromatic aberration strength  0–1
//   uWarp      — barrel warp strength           0–1
//   uVig       — base vignette                  0–1
//   uFlicker   — signal corruption flicker      0–1
//   uHeartbeat — heartbeat vignette pulse       0–1
//   uTime      — elapsed × 100

uniform float uCA;
uniform float uWarp;
uniform float uVig;
uniform float uFlicker;
uniform float uHeartbeat;
uniform float uTime;
uniform float uScan;
uniform float uVhs;
uniform float uGlitch;
uniform float uNonDomVig;
uniform float uDomEye;
uniform float uWhiteout;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 off = uv - 0.5;
  float r  = length(off);

  float t = uTime * 0.01;
  float line = floor(uv.y * 420.0);
  float lineNoise = rand(vec2(line, floor(t * 24.0)));
  float jitter = (lineNoise - 0.5) * uVhs * 0.008;
  float tear = step(0.86, sin(t * 1.7) * 0.5 + 0.5) * uGlitch;
  float tearBand = smoothstep(0.2, 0.0, abs(uv.y - fract(t * 0.23))) * tear;
  float tearShift = (rand(vec2(line, floor(t * 7.0))) - 0.5) * tearBand * 0.06;
  vec2 jitterUv = vec2(uv.x + jitter + tearShift, uv.y);

  // Barrel / stereographic warp (increases in Phase 2 → Bend)
  vec2 warpedUv = clamp(0.5 + (jitterUv - 0.5) * (1.0 + uWarp * 4.5 * r * r), 0.001, 0.999);

  // Chromatic aberration — split R/B channels by warp offset
  float ca  = uCA * 0.026;
  float edgeBoost = 0.35 + r * 1.8;
  vec2  cO  = (warpedUv - 0.5) * ca * edgeBoost;
  vec3  col;
  col.r = texture2D(inputBuffer, clamp(warpedUv + cO * (2.2 + uVhs * 1.5), 0.001, 0.999)).r;
  col.g = texture2D(inputBuffer, warpedUv).g;
  col.b = texture2D(inputBuffer, clamp(warpedUv - cO * (2.2 + uVhs * 1.5), 0.001, 0.999)).b;

  // Vignette (darkens edges) + heartbeat pulse amplifies it
  float hbVig = uVig + uHeartbeat * 0.55;
  col *= max(1.0 - r * r * 1.9 * hbVig, 0.0);

  float isLeft = step(uv.x, 0.5);
  float nonDom = mix(isLeft, 1.0 - isLeft, uDomEye);
  float extraVig = uNonDomVig * nonDom;
  col *= 1.0 - r * r * 1.6 * extraVig;

  // Heartbeat tints red briefly
  col.r = min(col.r + uHeartbeat * 0.07, 1.0);

  // Film grain + VHS noise
  float grain = fract(sin(dot(uv, vec2(127.1, 311.7)) + uTime * 0.003) * 43758.5) - 0.5;
  float tape = (rand(vec2(uv.y * 120.0, t * 8.0)) - 0.5) * uVhs * 0.18;
  col += grain * 0.026 + tape;

  // Scanlines
  float scan = sin((uv.y + t * 0.4) * 1200.0) * 0.5 + 0.5;
  col *= 1.0 - (0.08 + scan * 0.12) * uScan;

  // Signal flicker (Phase 3 overload — not yet active in phases 0-2)
  col *= 1.0 - uFlicker * (sin(uTime * 71.3) * 0.5 + 0.5) * 0.36;

  col = mix(col, vec3(1.0), clamp(uWhiteout, 0.0, 1.0));
  outputColor = vec4(max(col, 0.0), inputColor.a);
}
