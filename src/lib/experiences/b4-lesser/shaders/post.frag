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

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 off = uv - 0.5;
  float r  = length(off);

  // Barrel / stereographic warp (increases in Phase 2 → Bend)
  vec2 warpedUv = clamp(0.5 + off * (1.0 + uWarp * 4.5 * r * r), 0.001, 0.999);

  // Chromatic aberration — split R/B channels by warp offset
  float ca  = uCA * 0.026;
  vec2  cO  = (warpedUv - 0.5) * ca;
  vec3  col;
  col.r = texture2D(inputBuffer, clamp(warpedUv + cO * 2.2, 0.001, 0.999)).r;
  col.g = texture2D(inputBuffer, warpedUv).g;
  col.b = texture2D(inputBuffer, clamp(warpedUv - cO * 2.2, 0.001, 0.999)).b;

  // Vignette (darkens edges) + heartbeat pulse amplifies it
  float hbVig = uVig + uHeartbeat * 0.55;
  col *= max(1.0 - r * r * 1.9 * hbVig, 0.0);

  // Heartbeat tints red briefly
  col.r = min(col.r + uHeartbeat * 0.07, 1.0);

  // Film grain
  float grain = fract(sin(dot(uv, vec2(127.1, 311.7)) + uTime * 0.003) * 43758.5) - 0.5;
  col += grain * 0.026;

  // Signal flicker (Phase 3 overload — not yet active in phases 0-2)
  col *= 1.0 - uFlicker * (sin(uTime * 71.3) * 0.5 + 0.5) * 0.36;

  outputColor = vec4(max(col, 0.0), inputColor.a);
}
