uniform float uTime;
uniform vec3 uBase;
uniform vec3 uGlowA;
uniform vec3 uGlowB;
uniform vec3 uAccent;
uniform float uGlowIntensity;
uniform float uPulse;

uniform sampler2D uTex;
uniform sampler2D uTexAO;
uniform sampler2D uTexHeight;
uniform sampler2D uTexNormal;
uniform vec2 uTexScale;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// --- Organic Noise ---
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float noise3D(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), f.x),
        mix(dot(hash33(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash33(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dot(hash33(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash33(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), f.x),
        mix(dot(hash33(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash33(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise3D(p); p = p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  // 1. Slow creeping texture
  vec2 tuv = (vUv * uTexScale) + vec2(0.0, uTime * 0.12);

  // 2. Sample Maps
  vec3 albedo = texture2D(uTex, tuv).rgb;
  // EXPONENTIAL AO: Makes the shadows incredibly deep and dark
  float ao = pow(texture2D(uTexAO, tuv).r, 3.0); 
  float height = texture2D(uTexHeight, tuv).r;
  vec3 normalMap = texture2D(uTexNormal, tuv).xyz * 2.0 - 1.0;

  // 3. EXTREME Normal Mapping for heavy shading
  vec3 n = normalize(vNormal + normalMap * 2.5); 
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 lightDir = normalize(vec3(0.0, 0.0, -1.0)); 
  vec3 halfVec = normalize(lightDir + viewDir);

  // 4. Leviathan Bioluminescence
  float heatNoise = fbm(vWorldPosition * 0.04 + vec3(0.0, 0.0, uTime * 0.3));
  vec3 bioGlow = mix(uGlowA, uGlowB, smoothstep(0.2, 0.6, heatNoise));
  bioGlow = mix(bioGlow, uAccent, smoothstep(0.6, 0.9, heatNoise));

  // 5. Dark Steel Base
  float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
  vec3 steel = vec3(lum) * 0.2; 

  // 6. Blinding Wet Reflections
  float spec = pow(max(dot(n, halfVec), 0.0), 35.0); 
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  vec3 reflection = bioGlow * spec * 5.0 + bioGlow * fresnel * 1.5;

  // 7. Veins / System Bleed
  float cracks = smoothstep(0.25, 0.0, height);
  vec3 bleed = uAccent * cracks * (sin(uTime * 3.0) * 0.5 + 0.5) * 3.0;

  // Combine with heavy shadowing
  vec3 finalColor = (steel * ao + reflection * ao) * uGlowIntensity + (bleed * ao);

  // 8. DYNAMIC LIGHT AND DARKNESS SOURCES
  // Creates sweeping bands of deep shadow and intense brightness
  float lightWave = sin(vWorldPosition.z * 0.04 + uTime * 2.5) * 0.5 + 0.5;
  finalColor *= mix(0.15, 1.85, lightWave); // Dim to 15%, boost to 185%

  // Deep darkness fade
  float dist = distance(cameraPosition, vWorldPosition);
  float depthFade = 1.0 - smoothstep(15.0, 90.0, dist);

  gl_FragColor = vec4(finalColor * depthFade, 1.0);
}