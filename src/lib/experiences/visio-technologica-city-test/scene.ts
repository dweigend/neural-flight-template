import * as THREE from "three";
import { loadGLTF } from "$lib/three/loader";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { createPointcloudMaterial, createWireframeMaterial } from "./shaders";

const MODEL_URL = "/models/abandoned_alley_game_ready.glb";
const MODEL_TARGET_SIZE = 25;
const POINT_ORIGIN_POSITION = new THREE.Vector3(-2, 6, -0.7);
const WIREFRAME_ORIGIN_POSITION = new THREE.Vector3(2, 7, 0.7);
const POINT_RAY_ROTATION_DEG = new THREE.Vector3(-45, -120, 0);
const WIREFRAME_RAY_ROTATION_DEG = new THREE.Vector3(-27, 83, 0);
const POINT_RAY_FOV_DEG = 45;
const WIREFRAME_RAY_FOV_DEG = 45;
const RAY_PAN_ANGLE_DEG = 20;
const RAY_PAN_SPEED = 0.6;
const POINT_SAMPLING_FOV_DEG = POINT_RAY_FOV_DEG + RAY_PAN_ANGLE_DEG * 2;
const POINT_COUNT = 60_000;
const POINT_VISIBILITY_RAYS_PER_BATCH = 1350;
const WIREFRAME_VISIBILITY_RAYS_PER_BATCH = 1_100;
const VISIBILITY_UPDATE_FRAME_INTERVAL = 2;
const VISIBILITY_EPSILON = 0.08;
const ORIGIN_PATH_RADIUS = 2;
const ORIGIN_PATH_HEIGHT = 2.4;

const CAMERA_ORBIT_SPEED = 1.5;
const CAMERA_ZOOM_SPEED = 6;
const CAMERA_MIN_RADIUS = 5;
const CAMERA_MAX_RADIUS = 26;
const CAMERA_HEIGHT = 9;

export interface VisioTechnologicaCityTestState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  modelRoot: THREE.Group;
  sourceMeshes: THREE.Mesh[];
  pointRayConfig: RotationConfig;
  wireframeRayConfig: RotationConfig;
  pointGeometry: THREE.BufferGeometry;
  pointMaterial: THREE.ShaderMaterial;
  points: THREE.Points;
  pointWorldPositions: Float32Array;
  pointVisibilityValues: Float32Array;
  wireframeGeometry: THREE.BufferGeometry;
  wireframeMaterial: THREE.ShaderMaterial;
  wireframe: THREE.LineSegments;
  wireframeWorldPositions: Float32Array;
  wireframeVisibilityValues: Float32Array;
  originMarker: THREE.Mesh;
  wireOriginMarker: THREE.Mesh;
  pointDirectionHelper: THREE.ArrowHelper;
  wireDirectionHelper: THREE.ArrowHelper;
  originPath: THREE.Line;
  grid: THREE.GridHelper;
  raycaster: THREE.Raycaster;
  intersections: THREE.Intersection[];
  keys: Set<string>;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  frame: number;
  pointVisibilityCursor: number;
  wireframeVisibilityCursor: number;
  cameraAzimuth: number;
  cameraRadius: number;
}

const _originWorld = new THREE.Vector3();
const _pointRayOrigin = new THREE.Vector3();
const _wireRayOrigin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _localDirection = new THREE.Vector3();
const _cameraTarget = new THREE.Vector3(0, 1.4, 0);
let bvhInstalled = false;

interface RotationConfig {
  fovDeg: number;
  inverseQuaternion: THREE.Quaternion;
  quaternion: THREE.Quaternion;
}

interface SampledPointCloud {
  colors: Float32Array;
  positions: Float32Array;
  worldPositions: Float32Array;
}

interface WireframeData {
  positions: Float32Array;
  worldPositions: Float32Array;
}

interface TriangleRef {
  cumulativeArea: number;
  mesh: THREE.Mesh;
  triangleIndex: number;
}

interface TextureSampler {
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

type ColorSampleMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
};
type SizedCanvasImageSource = CanvasImageSource & {
  height: number;
  width: number;
};

function installBVHRaycasting(): void {
  if (bvhInstalled) return;

  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  bvhInstalled = true;
}

function createRotationConfig(
  rotationDeg: THREE.Vector3,
  fovDeg: number,
): RotationConfig {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDeg.x),
    THREE.MathUtils.degToRad(rotationDeg.y),
    THREE.MathUtils.degToRad(rotationDeg.z),
    "YXZ",
  );
  const quaternion = new THREE.Quaternion().setFromEuler(euler);

  return {
    fovDeg,
    inverseQuaternion: quaternion.clone().invert(),
    quaternion,
  };
}

function updateRotationConfig(
  config: RotationConfig,
  rotationDeg: THREE.Vector3,
  panDeg: number,
): void {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDeg.x),
    THREE.MathUtils.degToRad(rotationDeg.y + panDeg),
    THREE.MathUtils.degToRad(rotationDeg.z),
    "YXZ",
  );
  config.quaternion.setFromEuler(euler);
  config.inverseQuaternion.copy(config.quaternion).invert();
}

function directionFromRotation(
  rotationDeg: THREE.Vector3,
  panDeg = 0,
): THREE.Vector3 {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDeg.x),
    THREE.MathUtils.degToRad(rotationDeg.y + panDeg),
    THREE.MathUtils.degToRad(rotationDeg.z),
    "YXZ",
  );

  return new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
}

function fitModelToScene(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);

  if (largestAxis > 0) {
    model.scale.multiplyScalar(MODEL_TARGET_SIZE / largestAxis);
  }

  model.position.sub(center.multiplyScalar(model.scale.x));

  const fittedBox = new THREE.Box3().setFromObject(model);
  model.position.y -= fittedBox.min.y;
}

function disposeModelResources(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    if (child.geometry.boundsTree) {
      child.geometry.disposeBoundsTree();
    }
    child.geometry.dispose();

    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        material.dispose();
      }
      return;
    }

    child.material.dispose();
  });
}

function makeMaterialDoubleSided(material: THREE.Material): void {
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}

function collectSourceMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!(child.geometry instanceof THREE.BufferGeometry)) return;

    child.geometry.computeBoundsTree({ maxLeafSize: 8 });
    child.updateMatrixWorld(true);
    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        makeMaterialDoubleSided(material);
      }
    } else {
      makeMaterialDoubleSided(child.material);
    }
    child.visible = false;
    meshes.push(child);
  });

  return meshes;
}

function getTriangleCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  return geometry.index ? geometry.index.count / 3 : position.count / 3;
}

function readTriangleVertex(
  geometry: THREE.BufferGeometry,
  triangleIndex: number,
  vertexOffset: number,
  out: THREE.Vector3,
): void {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const sourceIndex = index
    ? index.getX(triangleIndex * 3 + vertexOffset)
    : triangleIndex * 3 + vertexOffset;

  out.fromBufferAttribute(position, sourceIndex);
}

function readTriangleAttribute(
  geometry: THREE.BufferGeometry,
  attributeName: string,
  triangleIndex: number,
  vertexOffset: number,
  out: THREE.Vector3,
): boolean {
  const attribute = geometry.getAttribute(attributeName);
  if (!attribute) return false;

  const index = geometry.index;
  const sourceIndex = index
    ? index.getX(triangleIndex * 3 + vertexOffset)
    : triangleIndex * 3 + vertexOffset;

  out.fromBufferAttribute(attribute, sourceIndex);
  return true;
}

function readTriangleUv(
  geometry: THREE.BufferGeometry,
  triangleIndex: number,
  vertexOffset: number,
  out: THREE.Vector2,
): boolean {
  const uv = geometry.getAttribute("uv");
  if (!uv) return false;

  const index = geometry.index;
  const sourceIndex = index
    ? index.getX(triangleIndex * 3 + vertexOffset)
    : triangleIndex * 3 + vertexOffset;

  out.fromBufferAttribute(uv as THREE.BufferAttribute, sourceIndex);
  return true;
}

function getTriangleMaterial(
  mesh: THREE.Mesh,
  triangleIndex: number,
): THREE.Material {
  if (!Array.isArray(mesh.material)) {
    return mesh.material;
  }

  const geometry = mesh.geometry;
  const triangleStart = triangleIndex * 3;
  const group = geometry.groups.find(
    (entry) =>
      triangleStart >= entry.start && triangleStart < entry.start + entry.count,
  );
  const materialIndex = group?.materialIndex ?? 0;

  return mesh.material[materialIndex] ?? mesh.material[0];
}

function getTextureSampler(
  texture: THREE.Texture,
  cache: Map<THREE.Texture, TextureSampler | null>,
): TextureSampler | null {
  if (cache.has(texture)) {
    return cache.get(texture) ?? null;
  }

  const image = texture.image as SizedCanvasImageSource | null;
  if (!image) {
    cache.set(texture, null);
    return null;
  }

  const width = image.width;
  const height = image.height;
  if (!width || !height) {
    cache.set(texture, null);
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    cache.set(texture, null);
    return null;
  }

  context.drawImage(image, 0, 0, width, height);
  const sampler = {
    data: context.getImageData(0, 0, width, height).data,
    height,
    width,
  };
  cache.set(texture, sampler);
  return sampler;
}

function sampleTextureColor(
  texture: THREE.Texture,
  uv: THREE.Vector2,
  cache: Map<THREE.Texture, TextureSampler | null>,
  out: THREE.Color,
): boolean {
  const sampler = getTextureSampler(texture, cache);
  if (!sampler) return false;

  const transformedUv = uv.clone();
  texture.updateMatrix();
  texture.transformUv(transformedUv);

  const x = THREE.MathUtils.clamp(
    Math.floor(transformedUv.x * sampler.width),
    0,
    sampler.width - 1,
  );
  const y = THREE.MathUtils.clamp(
    Math.floor(transformedUv.y * sampler.height),
    0,
    sampler.height - 1,
  );
  const index = (y * sampler.width + x) * 4;

  out.setRGB(
    sampler.data[index] / 255,
    sampler.data[index + 1] / 255,
    sampler.data[index + 2] / 255,
  );
  return true;
}

function sampleMaterialColor(
  mesh: THREE.Mesh,
  triangleIndex: number,
  wa: number,
  wb: number,
  wc: number,
  textureCache: Map<THREE.Texture, TextureSampler | null>,
  out: THREE.Color,
): void {
  const material = getTriangleMaterial(
    mesh,
    triangleIndex,
  ) as ColorSampleMaterial;
  out.copy(material.color ?? new THREE.Color("#ffffff"));

  const uvA = new THREE.Vector2();
  const uvB = new THREE.Vector2();
  const uvC = new THREE.Vector2();
  const uv = new THREE.Vector2();
  const hasUv =
    readTriangleUv(mesh.geometry, triangleIndex, 0, uvA) &&
    readTriangleUv(mesh.geometry, triangleIndex, 1, uvB) &&
    readTriangleUv(mesh.geometry, triangleIndex, 2, uvC);

  if (hasUv && material.map) {
    uv.set(0, 0)
      .addScaledVector(uvA, wa)
      .addScaledVector(uvB, wb)
      .addScaledVector(uvC, wc);

    const textureColor = new THREE.Color();
    if (sampleTextureColor(material.map, uv, textureCache, textureColor)) {
      out.multiply(textureColor);
    }
  }

  if (material.vertexColors) {
    const colorA = new THREE.Vector3();
    const colorB = new THREE.Vector3();
    const colorC = new THREE.Vector3();
    const hasVertexColor =
      readTriangleAttribute(mesh.geometry, "color", triangleIndex, 0, colorA) &&
      readTriangleAttribute(mesh.geometry, "color", triangleIndex, 1, colorB) &&
      readTriangleAttribute(mesh.geometry, "color", triangleIndex, 2, colorC);

    if (hasVertexColor) {
      out.multiply(
        new THREE.Color(
          colorA.x * wa + colorB.x * wb + colorC.x * wc,
          colorA.y * wa + colorB.y * wb + colorC.y * wc,
          colorA.z * wa + colorB.z * wb + colorC.z * wc,
        ),
      );
    }
  }
}

function buildTriangleRefs(meshes: THREE.Mesh[]): TriangleRef[] {
  const refs: TriangleRef[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let totalArea = 0;

  for (const mesh of meshes) {
    const triangleCount = getTriangleCount(mesh.geometry);

    for (let i = 0; i < triangleCount; i++) {
      readTriangleVertex(mesh.geometry, i, 0, a);
      readTriangleVertex(mesh.geometry, i, 1, b);
      readTriangleVertex(mesh.geometry, i, 2, c);

      a.applyMatrix4(mesh.matrixWorld);
      b.applyMatrix4(mesh.matrixWorld);
      c.applyMatrix4(mesh.matrixWorld);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      totalArea += ab.cross(ac).length() * 0.5;
      refs.push({ cumulativeArea: totalArea, mesh, triangleIndex: i });
    }
  }

  return refs;
}

function findTriangleRef(refs: TriangleRef[], target: number): TriangleRef {
  let low = 0;
  let high = refs.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (target <= refs[mid].cumulativeArea) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return refs[low];
}

function isWorldPointInsideDirectionalFrustum(
  point: THREE.Vector3,
  originPosition: THREE.Vector3,
  config: RotationConfig,
): boolean {
  _direction.subVectors(point, originPosition);
  _localDirection.copy(_direction).applyQuaternion(config.inverseQuaternion);

  const forwardDistance = -_localDirection.z;
  if (forwardDistance <= 0) {
    return false;
  }

  const halfSize =
    forwardDistance * Math.tan(THREE.MathUtils.degToRad(config.fovDeg) * 0.5);

  return (
    Math.abs(_localDirection.x) <= halfSize &&
    Math.abs(_localDirection.y) <= halfSize
  );
}

function samplePointCloud(
  meshes: THREE.Mesh[],
  count: number,
  samplingOrigin: THREE.Vector3,
  samplingConfig: RotationConfig,
): SampledPointCloud {
  const refs = buildTriangleRefs(meshes);
  const totalArea = refs[refs.length - 1]?.cumulativeArea ?? 0;

  if (refs.length === 0 || totalArea <= 0) {
    return {
      colors: new Float32Array(),
      positions: new Float32Array(),
      worldPositions: new Float32Array(),
    };
  }

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const worldPositions = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  const textureCache = new Map<THREE.Texture, TextureSampler | null>();
  const maxAttempts = count * 80;
  let written = 0;
  let attempts = 0;

  while (written < count && attempts < maxAttempts) {
    attempts++;
    const ref = findTriangleRef(refs, Math.random() * totalArea);
    readTriangleVertex(ref.mesh.geometry, ref.triangleIndex, 0, a);
    readTriangleVertex(ref.mesh.geometry, ref.triangleIndex, 1, b);
    readTriangleVertex(ref.mesh.geometry, ref.triangleIndex, 2, c);

    a.applyMatrix4(ref.mesh.matrixWorld);
    b.applyMatrix4(ref.mesh.matrixWorld);
    c.applyMatrix4(ref.mesh.matrixWorld);

    const r1 = Math.sqrt(Math.random());
    const r2 = Math.random();
    const wa = 1 - r1;
    const wb = r1 * (1 - r2);
    const wc = r1 * r2;

    point
      .set(0, 0, 0)
      .addScaledVector(a, wa)
      .addScaledVector(b, wb)
      .addScaledVector(c, wc);

    if (
      !isWorldPointInsideDirectionalFrustum(point, samplingOrigin, samplingConfig)
    ) {
      continue;
    }

    const positionIndex = written * 3;
    positions[positionIndex] = point.x;
    positions[positionIndex + 1] = point.y;
    positions[positionIndex + 2] = point.z;
    worldPositions[positionIndex] = point.x;
    worldPositions[positionIndex + 1] = point.y;
    worldPositions[positionIndex + 2] = point.z;

    sampleMaterialColor(
      ref.mesh,
      ref.triangleIndex,
      wa,
      wb,
      wc,
      textureCache,
      color,
    );
    colors[positionIndex] = color.r;
    colors[positionIndex + 1] = color.g;
    colors[positionIndex + 2] = color.b;
    written++;
  }

  return {
    colors: colors.slice(0, written * 3),
    positions: positions.slice(0, written * 3),
    worldPositions: worldPositions.slice(0, written * 3),
  };
}

function buildWireframeData(meshes: THREE.Mesh[]): WireframeData {
  const positions: number[] = [];
  const point = new THREE.Vector3();

  for (const mesh of meshes) {
    const wireGeometry = new THREE.WireframeGeometry(mesh.geometry);
    const wirePosition = wireGeometry.getAttribute("position");

    for (let i = 0; i < wirePosition.count; i++) {
      point.fromBufferAttribute(wirePosition, i).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }

    wireGeometry.dispose();
  }

  const positionArray = new Float32Array(positions);
  return {
    positions: positionArray,
    worldPositions: positionArray.slice(),
  };
}

function createOriginMarker(color: string, emissive: string): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.18, 24, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness: 0.45,
  });

  return new THREE.Mesh(geometry, material);
}

function createDirectionHelper(
  position: THREE.Vector3,
  rotationDeg: THREE.Vector3,
  color: string,
): THREE.ArrowHelper {
  return new THREE.ArrowHelper(
    directionFromRotation(rotationDeg),
    position,
    2.5,
    color,
    0.45,
    0.24,
  );
}

function createOriginPath(): THREE.Line {
  const points: THREE.Vector3[] = [];
  const segments = 128;

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(t) * ORIGIN_PATH_RADIUS,
        ORIGIN_PATH_HEIGHT,
        Math.sin(t) * ORIGIN_PATH_RADIUS,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: "#315862",
    transparent: true,
    opacity: 0.5,
  });

  return new THREE.Line(geometry, material);
}

function updateCameraOrbit(
  state: VisioTechnologicaCityTestState,
  delta: number,
): void {
  const left = state.keys.has("ArrowLeft");
  const right = state.keys.has("ArrowRight");
  const forward = state.keys.has("ArrowUp");
  const backward = state.keys.has("ArrowDown");

  if (left) {
    state.cameraAzimuth += CAMERA_ORBIT_SPEED * delta;
  }
  if (right) {
    state.cameraAzimuth -= CAMERA_ORBIT_SPEED * delta;
  }
  if (forward) {
    state.cameraRadius -= CAMERA_ZOOM_SPEED * delta;
  }
  if (backward) {
    state.cameraRadius += CAMERA_ZOOM_SPEED * delta;
  }

  state.cameraRadius = THREE.MathUtils.clamp(
    state.cameraRadius,
    CAMERA_MIN_RADIUS,
    CAMERA_MAX_RADIUS,
  );
  state.camera.position.set(
    Math.sin(state.cameraAzimuth) * state.cameraRadius,
    CAMERA_HEIGHT,
    Math.cos(state.cameraAzimuth) * state.cameraRadius,
  );
  state.camera.lookAt(_cameraTarget);
}

function updateRayPan(
  state: VisioTechnologicaCityTestState,
  elapsed: number,
): void {
  const panDeg = Math.sin(elapsed * RAY_PAN_SPEED) * RAY_PAN_ANGLE_DEG;

  updateRotationConfig(state.pointRayConfig, POINT_RAY_ROTATION_DEG, panDeg);
  updateRotationConfig(
    state.wireframeRayConfig,
    WIREFRAME_RAY_ROTATION_DEG,
    panDeg,
  );
  state.pointDirectionHelper.setDirection(
    directionFromRotation(POINT_RAY_ROTATION_DEG, panDeg),
  );
  state.wireDirectionHelper.setDirection(
    directionFromRotation(WIREFRAME_RAY_ROTATION_DEG, panDeg),
  );
}

function isWorldPositionVisibleFromDirectionalOrigin(
  state: VisioTechnologicaCityTestState,
  worldPositions: Float32Array,
  index: number,
  originPosition: THREE.Vector3,
  config: RotationConfig,
): boolean {
  const positionIndex = index * 3;

  _direction.set(
    worldPositions[positionIndex] - originPosition.x,
    worldPositions[positionIndex + 1] - originPosition.y,
    worldPositions[positionIndex + 2] - originPosition.z,
  );
  const distance = _direction.length();
  if (distance <= 0.0001) {
    return true;
  }

  _localDirection.copy(_direction).applyQuaternion(config.inverseQuaternion);
  const forwardDistance = -_localDirection.z;
  if (forwardDistance <= 0) {
    return false;
  }

  const halfSize =
    forwardDistance * Math.tan(THREE.MathUtils.degToRad(config.fovDeg) * 0.5);
  if (
    Math.abs(_localDirection.x) > halfSize ||
    Math.abs(_localDirection.y) > halfSize
  ) {
    return false;
  }

  _direction.divideScalar(distance);
  state.raycaster.set(originPosition, _direction);
  state.raycaster.near = 0.001;
  state.raycaster.far = distance + VISIBILITY_EPSILON;

  state.intersections.length = 0;
  state.raycaster.intersectObjects(
    state.sourceMeshes,
    false,
    state.intersections,
  );

  const hit = state.intersections[0];
  return !!hit && Math.abs(hit.distance - distance) <= VISIBILITY_EPSILON;
}

function updatePointVisibilityBatch(
  state: VisioTechnologicaCityTestState,
  config: RotationConfig,
): void {
  const pointCount = state.pointVisibilityValues.length;
  if (pointCount === 0) return;

  const visibilityAttribute = state.pointGeometry.getAttribute(
    "aVisibility",
  ) as THREE.BufferAttribute;
  const originPosition = state.originMarker.getWorldPosition(_pointRayOrigin);
  let remaining = POINT_VISIBILITY_RAYS_PER_BATCH;
  let changed = false;

  while (remaining > 0) {
    const start = state.pointVisibilityCursor;
    const count = Math.min(remaining, pointCount - start);
    let rangeChanged = false;

    for (let i = 0; i < count; i++) {
      const index = start + i;
      const wasVisible = state.pointVisibilityValues[index] > 0.5;
      const isVisible = isWorldPositionVisibleFromDirectionalOrigin(
        state,
        state.pointWorldPositions,
        index,
        originPosition,
        config,
      );

      if (wasVisible !== isVisible) {
        state.pointVisibilityValues[index] = isVisible ? 1 : 0;
        rangeChanged = true;
      }
    }

    if (rangeChanged) {
      visibilityAttribute.addUpdateRange(start, count);
      changed = true;
    }

    state.pointVisibilityCursor =
      (state.pointVisibilityCursor + count) % pointCount;
    remaining -= count;
  }

  if (changed) {
    visibilityAttribute.needsUpdate = true;
  }
}

function updateWireframeVisibilityBatch(
  state: VisioTechnologicaCityTestState,
  config: RotationConfig,
): void {
  const wireframeCount = state.wireframeVisibilityValues.length;
  if (wireframeCount === 0) return;

  const visibilityAttribute = state.wireframeGeometry.getAttribute(
    "aVisibility",
  ) as THREE.BufferAttribute;
  const originPosition =
    state.wireOriginMarker.getWorldPosition(_wireRayOrigin);
  let remaining = WIREFRAME_VISIBILITY_RAYS_PER_BATCH;
  let changed = false;

  while (remaining > 0) {
    const start = state.wireframeVisibilityCursor;
    const count = Math.min(remaining, wireframeCount - start);
    let rangeChanged = false;

    for (let i = 0; i < count; i++) {
      const index = start + i;
      const wasVisible = state.wireframeVisibilityValues[index] > 0.5;
      const isVisible = isWorldPositionVisibleFromDirectionalOrigin(
        state,
        state.wireframeWorldPositions,
        index,
        originPosition,
        config,
      );

      if (wasVisible !== isVisible) {
        state.wireframeVisibilityValues[index] = isVisible ? 1 : 0;
        rangeChanged = true;
      }
    }

    if (rangeChanged) {
      visibilityAttribute.addUpdateRange(start, count);
      changed = true;
    }

    state.wireframeVisibilityCursor =
      (state.wireframeVisibilityCursor + count) % wireframeCount;
    remaining -= count;
  }

  if (changed) {
    visibilityAttribute.needsUpdate = true;
  }
}

export async function setup(
  ctx: SetupContext,
): Promise<VisioTechnologicaCityTestState> {
  installBVHRaycasting();

  const modelRoot = new THREE.Group();
  modelRoot.name = "future-city-model-root";
  ctx.scene.add(modelRoot);

  const gltf = await loadGLTF(MODEL_URL);
  const model = gltf.scene;
  model.name = "abandoned-alley-model";
  fitModelToScene(model);
  modelRoot.add(model);

  const sourceMeshes = collectSourceMeshes(modelRoot);
  const pointSamplingConfig = createRotationConfig(
    POINT_RAY_ROTATION_DEG,
    POINT_SAMPLING_FOV_DEG,
  );
  const pointCloud = samplePointCloud(
    sourceMeshes,
    POINT_COUNT,
    POINT_ORIGIN_POSITION,
    pointSamplingConfig,
  );
  const pointVisibilityValues = new Float32Array(
    pointCloud.positions.length / 3,
  );
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pointCloud.positions, 3),
  );
  pointGeometry.setAttribute(
    "aColor",
    new THREE.BufferAttribute(pointCloud.colors, 3),
  );
  pointGeometry.setAttribute(
    "aVisibility",
    new THREE.BufferAttribute(pointVisibilityValues, 1),
  );
  pointGeometry.computeBoundingSphere();

  const pointMaterial = createPointcloudMaterial();
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.name = "future-city-pointcloud";
  ctx.scene.add(points);

  const wireframeData = buildWireframeData(sourceMeshes);
  const wireframeVisibilityValues = new Float32Array(
    wireframeData.positions.length / 3,
  );
  const wireframeGeometry = new THREE.BufferGeometry();
  wireframeGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(wireframeData.positions, 3),
  );
  wireframeGeometry.setAttribute(
    "aVisibility",
    new THREE.BufferAttribute(wireframeVisibilityValues, 1),
  );
  wireframeGeometry.computeBoundingSphere();

  const wireframeMaterial = createWireframeMaterial();
  const wireframe = new THREE.LineSegments(
    wireframeGeometry,
    wireframeMaterial,
  );
  wireframe.name = "future-city-wireframe";
  ctx.scene.add(wireframe);

  const originMarker = createOriginMarker("#ffcc66", "#553300");
  originMarker.position.copy(POINT_ORIGIN_POSITION);
  ctx.scene.add(originMarker);

  const wireOriginMarker = createOriginMarker("#ff5ad1", "#55103f");
  wireOriginMarker.position.copy(WIREFRAME_ORIGIN_POSITION);
  ctx.scene.add(wireOriginMarker);

  const pointDirectionHelper = createDirectionHelper(
    POINT_ORIGIN_POSITION,
    POINT_RAY_ROTATION_DEG,
    "#ffcc66",
  );
  ctx.scene.add(pointDirectionHelper);

  const wireDirectionHelper = createDirectionHelper(
    WIREFRAME_ORIGIN_POSITION,
    WIREFRAME_RAY_ROTATION_DEG,
    "#ff5ad1",
  );
  ctx.scene.add(wireDirectionHelper);

  const originPath = createOriginPath();
  ctx.scene.add(originPath);

  const grid = new THREE.GridHelper(28, 28, "#17343c", "#0c1d23");
  grid.position.y = -0.02;
  ctx.scene.add(grid);

  const keys = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.key.startsWith("Arrow")) return;

    event.preventDefault();
    keys.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!event.key.startsWith("Arrow")) return;

    event.preventDefault();
    keys.delete(event.key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  ctx.camera.position.set(0, CAMERA_HEIGHT, 14);
  ctx.camera.lookAt(_cameraTarget);

  const pointRayConfig = createRotationConfig(
    POINT_RAY_ROTATION_DEG,
    POINT_RAY_FOV_DEG,
  );
  const wireframeRayConfig = createRotationConfig(
    WIREFRAME_RAY_ROTATION_DEG,
    WIREFRAME_RAY_FOV_DEG,
  );

  const state: VisioTechnologicaCityTestState = {
    camera: ctx.camera,
    modelRoot,
    sourceMeshes,
    pointRayConfig,
    wireframeRayConfig,
    pointGeometry,
    pointMaterial,
    points,
    pointWorldPositions: pointCloud.worldPositions,
    pointVisibilityValues,
    wireframeGeometry,
    wireframeMaterial,
    wireframe,
    wireframeWorldPositions: wireframeData.worldPositions,
    wireframeVisibilityValues,
    originMarker,
    wireOriginMarker,
    pointDirectionHelper,
    wireDirectionHelper,
    originPath,
    grid,
    raycaster: new THREE.Raycaster(),
    intersections: [],
    keys,
    onKeyDown,
    onKeyUp,
    frame: 0,
    pointVisibilityCursor: 0,
    wireframeVisibilityCursor: 0,
    cameraAzimuth: 0,
    cameraRadius: 14,
  };
  state.raycaster.firstHitOnly = true;

  for (
    let i = 0;
    i <
    Math.ceil(pointVisibilityValues.length / POINT_VISIBILITY_RAYS_PER_BATCH);
    i++
  ) {
    updatePointVisibilityBatch(state, pointRayConfig);
  }
  for (
    let i = 0;
    i <
    Math.ceil(
      wireframeVisibilityValues.length / WIREFRAME_VISIBILITY_RAYS_PER_BATCH,
    );
    i++
  ) {
    updateWireframeVisibilityBatch(state, wireframeRayConfig);
  }

  pointGeometry.getAttribute("aVisibility").needsUpdate = true;
  wireframeGeometry.getAttribute("aVisibility").needsUpdate = true;
  pointMaterial.uniforms.uOrigin.value.copy(
    originMarker.getWorldPosition(_originWorld),
  );
  wireframeMaterial.uniforms.uOrigin.value.copy(
    wireOriginMarker.getWorldPosition(_originWorld),
  );

  return state;
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState } {
  const s = state as VisioTechnologicaCityTestState;

  updateRayPan(s, ctx.elapsed);
  s.pointMaterial.uniforms.uOrigin.value.copy(
    s.originMarker.getWorldPosition(_originWorld),
  );
  s.wireframeMaterial.uniforms.uOrigin.value.copy(
    s.wireOriginMarker.getWorldPosition(_originWorld),
  );

  s.frame += 1;
  if (s.frame % VISIBILITY_UPDATE_FRAME_INTERVAL === 0) {
    updatePointVisibilityBatch(s, s.pointRayConfig);
    updateWireframeVisibilityBatch(s, s.wireframeRayConfig);
  }

  updateCameraOrbit(s, ctx.delta);

  return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as VisioTechnologicaCityTestState;

  scene.remove(s.modelRoot);
  scene.remove(s.points);
  scene.remove(s.wireframe);
  scene.remove(s.originMarker);
  scene.remove(s.wireOriginMarker);
  scene.remove(s.pointDirectionHelper);
  scene.remove(s.wireDirectionHelper);
  scene.remove(s.originPath);
  scene.remove(s.grid);

  window.removeEventListener("keydown", s.onKeyDown);
  window.removeEventListener("keyup", s.onKeyUp);

  disposeModelResources(s.modelRoot);
  s.pointGeometry.dispose();
  s.pointMaterial.dispose();
  s.wireframeGeometry.dispose();
  s.wireframeMaterial.dispose();

  s.originMarker.geometry.dispose();
  if (s.originMarker.material instanceof THREE.Material) {
    s.originMarker.material.dispose();
  }
  s.wireOriginMarker.geometry.dispose();
  if (s.wireOriginMarker.material instanceof THREE.Material) {
    s.wireOriginMarker.material.dispose();
  }
  s.pointDirectionHelper.dispose();
  s.wireDirectionHelper.dispose();

  s.originPath.geometry.dispose();
  if (s.originPath.material instanceof THREE.Material) {
    s.originPath.material.dispose();
  }

  s.grid.geometry.dispose();
  if (s.grid.material instanceof THREE.Material) {
    s.grid.material.dispose();
  }
}
