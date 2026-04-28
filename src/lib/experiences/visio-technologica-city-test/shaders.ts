import * as THREE from "three";

const pointcloudVertexShader = `
attribute float aVisibility;
attribute vec3 aColor;

uniform float uPointSize;
uniform vec3 uOrigin;

varying float vOriginDistance;
varying float vVisibility;
varying vec3 vColor;

void main() {
	vec4 worldPosition = modelMatrix * vec4(position, 1.0);
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	float cameraDistance = max(-mvPosition.z, 0.001);

	vColor = aColor;
	vVisibility = aVisibility;
	vOriginDistance = distance(worldPosition.xyz, uOrigin);

	gl_PointSize = uPointSize * (10.0 / cameraDistance) * vVisibility;
	gl_Position = projectionMatrix * mvPosition;
}
`;

const pointcloudFragmentShader = `
uniform float uOpacity;

varying float vOriginDistance;
varying float vVisibility;
varying vec3 vColor;

void main() {
	if (vVisibility < 0.5) {
		discard;
	}

	float distanceGlow = 1.0 - smoothstep(0.0, 8.0, vOriginDistance);
	vec3 color = vColor + vec3(0.12, 0.28, 0.34) * distanceGlow;

	gl_FragColor = vec4(color * uOpacity, 1.0);
}
`;

const wireframeVertexShader = `
attribute float aVisibility;

uniform vec3 uOrigin;

varying float vOriginDistance;
varying float vVisibility;

void main() {
	vec4 worldPosition = modelMatrix * vec4(position, 1.0);

	vVisibility = aVisibility;
	vOriginDistance = distance(worldPosition.xyz, uOrigin);

	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const wireframeFragmentShader = `
uniform vec3 uColor;

varying float vOriginDistance;
varying float vVisibility;

void main() {
	if (vVisibility < 0.5) {
		discard;
	}

	float originGlow = 1.0 - smoothstep(0.0, 8.0, vOriginDistance);
	vec3 color = uColor + vec3(0.32, 0.08, 0.24) * originGlow;

	gl_FragColor = vec4(color, 1.0);
}
`;

export function createPointcloudMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: pointcloudVertexShader,
    fragmentShader: pointcloudFragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uOpacity: { value: 1.0 },
      uOrigin: { value: new THREE.Vector3() },
      uPointSize: { value: 15 },
    },
  });
}

export function createWireframeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: wireframeVertexShader,
    fragmentShader: wireframeFragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color("#ff5ad1") },
      uOrigin: { value: new THREE.Vector3() },
    },
  });
}
