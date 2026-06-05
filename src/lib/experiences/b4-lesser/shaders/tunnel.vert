uniform float uTime;
uniform float uWaveAmp;
uniform float uPulse;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  // Calculate normal
  vNormal = normalize(normalMatrix * normal);
  
  vec3 pos = position;

  // 1. Leviathan Twists (Heavy organic bending)
  float twistX = sin(pos.z * 0.04 + uTime * 1.2) * uWaveAmp * 2.0;
  float twistY = cos(pos.z * 0.06 - uTime * 0.9) * uWaveAmp * 1.5;
  pos.x += twistX;
  pos.y += twistY;

  // 2. Peristaltic Squeeze (The swallowing animation)
  float squeeze = sin(uTime * 3.5 + pos.z * 0.15) * 0.15 + 
                  cos(uTime * 1.8 - pos.z * 0.05) * 0.1;
                  
  pos.xy *= 1.0 + squeeze * (1.0 + uPulse);

  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}