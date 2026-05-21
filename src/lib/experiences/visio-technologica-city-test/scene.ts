import * as THREE from "three";
import { loadGLTF } from "$lib/three/loader";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import {
  createPointcloudMaterial,
  createTextureRevealMaterial,
  createWireframeMaterial,
  type TextureRevealUniforms,
} from "./shaders";

const MODEL_URL = "/models/apartment_floor_plan.glb";
const MODEL_TARGET_SIZE = 25;
const POINTCLOUD_ENABLED = false;
const POINT_ORIGIN_POSITION = new THREE.Vector3(-2, 6, -0.7);
const WIREFRAME_ORIGIN_POSITION = new THREE.Vector3(4, 10, 7);
const TEXTURE_ORIGIN_POSITION = new THREE.Vector3(4, 10, 8);
const POINT_RAY_ROTATION_DEG = new THREE.Vector3(-45, 0, 0);
const WIREFRAME_RAY_ROTATION_DEG = new THREE.Vector3(-27, 80, 0);
const TEXTURE_RAY_ROTATION_DEG = new THREE.Vector3(-27, 20, 0);
const POINT_RAY_FOV_DEG = 60;
const WIREFRAME_RAY_FOV_DEG = 60;
const TEXTURE_RAY_FOV_DEG = 60;
const RAY_PAN_ANGLE_DEG = 40;
const RAY_PAN_SPEED = 0.6;
const TEXTURE_RAY_PAN_ANGLE_DEG = 15;
const TEXTURE_RAY_PAN_SPEED = 0.35;
const POINT_SAMPLING_FOV_DEG = POINT_RAY_FOV_DEG + RAY_PAN_ANGLE_DEG * 2;
const POINT_COUNT = 60_000;
const POINT_VISIBILITY_RAYS_PER_BATCH = 1350;
const WIREFRAME_VISIBILITY_RAYS_PER_BATCH = 1_100;
const VISIBILITY_UPDATE_FRAME_INTERVAL = 2;
const VISIBILITY_EPSILON = 0.08;
const TEXTURE_REVEAL_DEPTH_SIZE = 1024;
const TEXTURE_REVEAL_DEPTH_BIAS = 0.000_2;
const TEXTURE_REVEAL_NEAR = 0.2;
const TEXTURE_REVEAL_FAR = 80;
const ORIGIN_PATH_RADIUS = 2;
const ORIGIN_PATH_HEIGHT = 2.4;

const CAMERA_TURN_SPEED = 1.2;
const CAMERA_TILT_SPEED = 1.0;
const CAMERA_MOVE_SPEED = 7;
const CAMERA_HEIGHT = 9;
const CAMERA_START_PITCH_DEG = -28;
const CAMERA_START_POSITION = new THREE.Vector3(0, CAMERA_HEIGHT, 14);

export interface VisioTechnologicaCityTestState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  modelRoot: THREE.Group;
  sourceMeshes: THREE.Mesh[];
  pointRayConfig: RotationConfig;
  wireframeRayConfig: RotationConfig;
  textureRayConfig: RotationConfig;
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
  textureRevealMeshes: THREE.Mesh[];
  textureRevealMaterials: THREE.Material[];
  textureDepthCamera: THREE.PerspectiveCamera;
  textureDepthMaterials: THREE.MeshDepthMaterial[];
  textureDepthRenderTarget: THREE.WebGLRenderTarget;
  textureDepthScene: THREE.Scene;
  textureProjectionMatrix: THREE.Matrix4;
  textureRevealUniforms: TextureRevealUniforms;
  originMarker: THREE.Mesh;
  wireOriginMarker: THREE.Mesh;
  textureOriginMarker: THREE.Mesh;
  pointDirectionHelper: THREE.ArrowHelper;
  wireDirectionHelper: THREE.ArrowHelper;
  textureDirectionHelper: THREE.ArrowHelper;
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
  cameraPitch: number;
  cameraYaw: number;
}

const _originWorld = new THREE.Vector3();
const _pointRayOrigin = new THREE.Vector3();
const _wireRayOrigin = new THREE.Vector3();
const _textureRayOrigin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _localDirection = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _previousClearColor = new THREE.Color();
const _textureProjectionBias = new THREE.Matrix4().set(
  0.5,
  0,
  0,
  0.5,
  0,
  0.5,
  0,
  0.5,
  0,
  0,
  0.5,
  0.5,
  0,
  0,
  0,
  1,
);
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

interface TextureRevealMeshData {
  depthMaterials: THREE.MeshDepthMaterial[];
  depthMeshes: THREE.Mesh[];
  revealMaterials: THREE.Material[];
  revealMeshes: THREE.Mesh[];
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
type AlphaDepthMaterialSource = THREE.Material & {
  alphaMap?: THREE.Texture | null;
  map?: THREE.Texture | null;
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
      !isWorldPointInsideDirectionalFrustum(
        point,
        samplingOrigin,
        samplingConfig,
      )
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

function createTextureDepthRenderTarget(): THREE.WebGLRenderTarget {
  const renderTarget = new THREE.WebGLRenderTarget(
    TEXTURE_REVEAL_DEPTH_SIZE,
    TEXTURE_REVEAL_DEPTH_SIZE,
    {
      depthBuffer: true,
      format: THREE.RGBAFormat,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
    },
  );
  renderTarget.texture.name = "future-city-texture-reveal-packed-depth";
  renderTarget.texture.generateMipmaps = false;

  return renderTarget;
}

function copyWorldTransform(source: THREE.Mesh, target: THREE.Mesh): void {
  target.matrixAutoUpdate = false;
  target.matrix.copy(source.matrixWorld);
  target.matrixWorld.copy(source.matrixWorld);
}

function createTextureRevealMaterialSet(
  sourceMaterial: THREE.Material | THREE.Material[],
  uniforms: TextureRevealUniforms,
  revealMaterials: THREE.Material[],
): THREE.Material | THREE.Material[] {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => {
      const revealMaterial = createTextureRevealMaterial(material, uniforms);
      revealMaterials.push(revealMaterial);
      return revealMaterial;
    });
  }

  const revealMaterial = createTextureRevealMaterial(sourceMaterial, uniforms);
  revealMaterials.push(revealMaterial);
  return revealMaterial;
}

function createTextureDepthMaterial(
  sourceMaterial: THREE.Material,
): THREE.MeshDepthMaterial {
  const source = sourceMaterial as AlphaDepthMaterialSource;
  const alphaTest =
    source.alphaTest > 0 ? source.alphaTest : source.transparent ? 0.5 : 0;
  const material = new THREE.MeshDepthMaterial({
    alphaMap: source.alphaMap ?? null,
    alphaTest,
    blending: THREE.NoBlending,
    depthPacking: THREE.RGBADepthPacking,
    map: source.map ?? null,
    side: THREE.DoubleSide,
  });
  material.opacity = source.opacity;

  return material;
}

function createTextureDepthMaterialSet(
  sourceMaterial: THREE.Material | THREE.Material[],
  depthMaterials: THREE.MeshDepthMaterial[],
): THREE.MeshDepthMaterial | THREE.MeshDepthMaterial[] {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => {
      const depthMaterial = createTextureDepthMaterial(material);
      depthMaterials.push(depthMaterial);
      return depthMaterial;
    });
  }

  const depthMaterial = createTextureDepthMaterial(sourceMaterial);
  depthMaterials.push(depthMaterial);
  return depthMaterial;
}

function createTextureRevealMeshes(
  sourceMeshes: THREE.Mesh[],
  uniforms: TextureRevealUniforms,
): TextureRevealMeshData {
  const depthMaterials: THREE.MeshDepthMaterial[] = [];
  const depthMeshes: THREE.Mesh[] = [];
  const revealMaterials: THREE.Material[] = [];
  const revealMeshes: THREE.Mesh[] = [];

  for (const sourceMesh of sourceMeshes) {
    const revealMesh = new THREE.Mesh(
      sourceMesh.geometry,
      createTextureRevealMaterialSet(
        sourceMesh.material,
        uniforms,
        revealMaterials,
      ),
    );
    revealMesh.name = `${sourceMesh.name || "mesh"}-texture-reveal`;
    copyWorldTransform(sourceMesh, revealMesh);
    revealMeshes.push(revealMesh);

    const depthMesh = new THREE.Mesh(
      sourceMesh.geometry,
      createTextureDepthMaterialSet(sourceMesh.material, depthMaterials),
    );
    depthMesh.name = `${sourceMesh.name || "mesh"}-texture-depth`;
    copyWorldTransform(sourceMesh, depthMesh);
    depthMeshes.push(depthMesh);
  }

  return { depthMaterials, depthMeshes, revealMaterials, revealMeshes };
}

function updateTextureRevealProjection(
  state: VisioTechnologicaCityTestState,
): void {
  const originPosition =
    state.textureOriginMarker.getWorldPosition(_textureRayOrigin);

  state.textureDepthCamera.position.copy(originPosition);
  state.textureDepthCamera.quaternion.copy(state.textureRayConfig.quaternion);
  state.textureDepthCamera.fov = state.textureRayConfig.fovDeg;
  state.textureDepthCamera.aspect = 1;
  state.textureDepthCamera.near = TEXTURE_REVEAL_NEAR;
  state.textureDepthCamera.far = TEXTURE_REVEAL_FAR;
  state.textureDepthCamera.updateProjectionMatrix();
  state.textureDepthCamera.updateMatrixWorld(true);
  state.textureDepthCamera.matrixWorldInverse
    .copy(state.textureDepthCamera.matrixWorld)
    .invert();
  state.textureProjectionMatrix
    .copy(_textureProjectionBias)
    .multiply(state.textureDepthCamera.projectionMatrix)
    .multiply(state.textureDepthCamera.matrixWorldInverse);
}

function renderTextureRevealDepth(state: VisioTechnologicaCityTestState): void {
  const renderer = state.renderer;
  const previousRenderTarget = renderer.getRenderTarget();
  const previousXrEnabled = renderer.xr.enabled;
  const previousAutoClear = renderer.autoClear;
  const previousClearAlpha = renderer.getClearAlpha();
  renderer.getClearColor(_previousClearColor);

  renderer.xr.enabled = false;
  renderer.autoClear = true;
  renderer.setClearColor(0xffffff, 1);
  renderer.setRenderTarget(state.textureDepthRenderTarget);
  renderer.clear();
  renderer.render(state.textureDepthScene, state.textureDepthCamera);
  renderer.setRenderTarget(previousRenderTarget);
  renderer.setClearColor(_previousClearColor, previousClearAlpha);
  renderer.autoClear = previousAutoClear;
  renderer.xr.enabled = previousXrEnabled;
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

function updateCameraFreeMovement(
  state: VisioTechnologicaCityTestState,
  delta: number,
): void {
  const left = state.keys.has("ArrowLeft");
  const right = state.keys.has("ArrowRight");
  const forward = state.keys.has("ArrowUp");
  const backward = state.keys.has("ArrowDown");
  const pitchUp = state.keys.has("w");
  const pitchDown = state.keys.has("s");
  const strafeLeft = state.keys.has("a");
  const strafeRight = state.keys.has("d");

  if (left) {
    state.cameraYaw += CAMERA_TURN_SPEED * delta;
  }
  if (right) {
    state.cameraYaw -= CAMERA_TURN_SPEED * delta;
  }
  if (pitchUp) {
    state.cameraPitch += CAMERA_TILT_SPEED * delta;
  }
  if (pitchDown) {
    state.cameraPitch -= CAMERA_TILT_SPEED * delta;
  }

  state.camera.rotation.set(state.cameraPitch, state.cameraYaw, 0, "YXZ");

  _cameraForward.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
  _cameraForward.normalize();
  _cameraRight.set(1, 0, 0).applyQuaternion(state.camera.quaternion);
  _cameraRight.normalize();

  if (forward) {
    state.camera.position.addScaledVector(
      _cameraForward,
      CAMERA_MOVE_SPEED * delta,
    );
  }
  if (backward) {
    state.camera.position.addScaledVector(
      _cameraForward,
      -CAMERA_MOVE_SPEED * delta,
    );
  }
  if (strafeLeft) {
    state.camera.position.addScaledVector(
      _cameraRight,
      -CAMERA_MOVE_SPEED * delta,
    );
  }
  if (strafeRight) {
    state.camera.position.addScaledVector(
      _cameraRight,
      CAMERA_MOVE_SPEED * delta,
    );
  }
}

function updateRayPan(
  state: VisioTechnologicaCityTestState,
  elapsed: number,
): void {
  const panDeg = Math.sin(elapsed * RAY_PAN_SPEED) * RAY_PAN_ANGLE_DEG;
  const texturePanDeg =
    Math.sin(elapsed * TEXTURE_RAY_PAN_SPEED) * TEXTURE_RAY_PAN_ANGLE_DEG;

  updateRotationConfig(state.pointRayConfig, POINT_RAY_ROTATION_DEG, panDeg);
  updateRotationConfig(
    state.wireframeRayConfig,
    WIREFRAME_RAY_ROTATION_DEG,
    panDeg,
  );
  updateRotationConfig(
    state.textureRayConfig,
    TEXTURE_RAY_ROTATION_DEG,
    texturePanDeg,
  );
  state.pointDirectionHelper.setDirection(
    directionFromRotation(POINT_RAY_ROTATION_DEG, panDeg),
  );
  state.wireDirectionHelper.setDirection(
    directionFromRotation(WIREFRAME_RAY_ROTATION_DEG, panDeg),
  );
  state.textureDirectionHelper.setDirection(
    directionFromRotation(TEXTURE_RAY_ROTATION_DEG, texturePanDeg),
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
  const textureProjectionMatrix = new THREE.Matrix4();
  const textureDepthRenderTarget = createTextureDepthRenderTarget();
  const textureRevealUniforms: TextureRevealUniforms = {
    uTextureRevealDepthBias: { value: TEXTURE_REVEAL_DEPTH_BIAS },
    uTextureRevealDepthMap: { value: textureDepthRenderTarget.texture },
    uTextureRevealProjectionMatrix: { value: textureProjectionMatrix },
  };
  const textureDepthCamera = new THREE.PerspectiveCamera(
    TEXTURE_RAY_FOV_DEG,
    1,
    TEXTURE_REVEAL_NEAR,
    TEXTURE_REVEAL_FAR,
  );
  const textureDepthScene = new THREE.Scene();
  const textureRevealData = createTextureRevealMeshes(
    sourceMeshes,
    textureRevealUniforms,
  );
  for (const depthMesh of textureRevealData.depthMeshes) {
    textureDepthScene.add(depthMesh);
  }
  for (const revealMesh of textureRevealData.revealMeshes) {
    ctx.scene.add(revealMesh);
  }

  const pointSamplingConfig = createRotationConfig(
    POINT_RAY_ROTATION_DEG,
    POINT_SAMPLING_FOV_DEG,
  );
  const pointCloud = POINTCLOUD_ENABLED
    ? samplePointCloud(
        sourceMeshes,
        POINT_COUNT,
        POINT_ORIGIN_POSITION,
        pointSamplingConfig,
      )
    : {
        colors: new Float32Array(),
        positions: new Float32Array(),
        worldPositions: new Float32Array(),
      };
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
  if (POINTCLOUD_ENABLED) {
    ctx.scene.add(points);
  }

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
  if (POINTCLOUD_ENABLED) {
    ctx.scene.add(originMarker);
  }

  const wireOriginMarker = createOriginMarker("#ff5ad1", "#55103f");
  wireOriginMarker.position.copy(WIREFRAME_ORIGIN_POSITION);
  ctx.scene.add(wireOriginMarker);

  const textureOriginMarker = createOriginMarker("#66ff9a", "#0f4f28");
  textureOriginMarker.position.copy(TEXTURE_ORIGIN_POSITION);
  ctx.scene.add(textureOriginMarker);

  const pointDirectionHelper = createDirectionHelper(
    POINT_ORIGIN_POSITION,
    POINT_RAY_ROTATION_DEG,
    "#ffcc66",
  );
  if (POINTCLOUD_ENABLED) {
    ctx.scene.add(pointDirectionHelper);
  }

  const wireDirectionHelper = createDirectionHelper(
    WIREFRAME_ORIGIN_POSITION,
    WIREFRAME_RAY_ROTATION_DEG,
    "#ff5ad1",
  );
  ctx.scene.add(wireDirectionHelper);

  const textureDirectionHelper = createDirectionHelper(
    TEXTURE_ORIGIN_POSITION,
    TEXTURE_RAY_ROTATION_DEG,
    "#66ff9a",
  );
  ctx.scene.add(textureDirectionHelper);

  const originPath = createOriginPath();
  ctx.scene.add(originPath);

  const grid = new THREE.GridHelper(28, 28, "#17343c", "#0c1d23");
  grid.position.y = -0.02;
  ctx.scene.add(grid);

  const keys = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (!event.key.startsWith("Arrow") && !["w", "a", "s", "d"].includes(key)) {
      return;
    }

    event.preventDefault();
    keys.add(event.key.startsWith("Arrow") ? event.key : key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (!event.key.startsWith("Arrow") && !["w", "a", "s", "d"].includes(key)) {
      return;
    }

    event.preventDefault();
    keys.delete(event.key.startsWith("Arrow") ? event.key : key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  ctx.camera.position.copy(CAMERA_START_POSITION);
  ctx.camera.rotation.set(
    THREE.MathUtils.degToRad(CAMERA_START_PITCH_DEG),
    0,
    0,
    "YXZ",
  );

  const pointRayConfig = createRotationConfig(
    POINT_RAY_ROTATION_DEG,
    POINT_RAY_FOV_DEG,
  );
  const wireframeRayConfig = createRotationConfig(
    WIREFRAME_RAY_ROTATION_DEG,
    WIREFRAME_RAY_FOV_DEG,
  );
  const textureRayConfig = createRotationConfig(
    TEXTURE_RAY_ROTATION_DEG,
    TEXTURE_RAY_FOV_DEG,
  );

  const state: VisioTechnologicaCityTestState = {
    camera: ctx.camera,
    renderer: ctx.renderer,
    modelRoot,
    sourceMeshes,
    pointRayConfig,
    wireframeRayConfig,
    textureRayConfig,
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
    textureRevealMeshes: textureRevealData.revealMeshes,
    textureRevealMaterials: textureRevealData.revealMaterials,
    textureDepthCamera,
    textureDepthMaterials: textureRevealData.depthMaterials,
    textureDepthRenderTarget,
    textureDepthScene,
    textureProjectionMatrix,
    textureRevealUniforms,
    originMarker,
    wireOriginMarker,
    textureOriginMarker,
    pointDirectionHelper,
    wireDirectionHelper,
    textureDirectionHelper,
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
    cameraPitch: THREE.MathUtils.degToRad(CAMERA_START_PITCH_DEG),
    cameraYaw: 0,
  };
  state.raycaster.firstHitOnly = true;
  updateTextureRevealProjection(state);
  renderTextureRevealDepth(state);

  if (POINTCLOUD_ENABLED) {
    for (
      let i = 0;
      i <
      Math.ceil(pointVisibilityValues.length / POINT_VISIBILITY_RAYS_PER_BATCH);
      i++
    ) {
      updatePointVisibilityBatch(state, pointRayConfig);
    }
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

  if (POINTCLOUD_ENABLED) {
    pointGeometry.getAttribute("aVisibility").needsUpdate = true;
  }
  wireframeGeometry.getAttribute("aVisibility").needsUpdate = true;
  if (POINTCLOUD_ENABLED) {
    pointMaterial.uniforms.uOrigin.value.copy(
      originMarker.getWorldPosition(_originWorld),
    );
  }
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
  updateTextureRevealProjection(s);
  renderTextureRevealDepth(s);
  if (POINTCLOUD_ENABLED) {
    s.pointMaterial.uniforms.uOrigin.value.copy(
      s.originMarker.getWorldPosition(_originWorld),
    );
  }
  s.wireframeMaterial.uniforms.uOrigin.value.copy(
    s.wireOriginMarker.getWorldPosition(_originWorld),
  );

  s.frame += 1;
  if (s.frame % VISIBILITY_UPDATE_FRAME_INTERVAL === 0) {
    if (POINTCLOUD_ENABLED) {
      updatePointVisibilityBatch(s, s.pointRayConfig);
    }
    updateWireframeVisibilityBatch(s, s.wireframeRayConfig);
  }

  updateCameraFreeMovement(s, ctx.delta);

  return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as VisioTechnologicaCityTestState;

  scene.remove(s.modelRoot);
  for (const revealMesh of s.textureRevealMeshes) {
    scene.remove(revealMesh);
  }
  scene.remove(s.points);
  scene.remove(s.wireframe);
  scene.remove(s.originMarker);
  scene.remove(s.wireOriginMarker);
  scene.remove(s.textureOriginMarker);
  scene.remove(s.pointDirectionHelper);
  scene.remove(s.wireDirectionHelper);
  scene.remove(s.textureDirectionHelper);
  scene.remove(s.originPath);
  scene.remove(s.grid);

  window.removeEventListener("keydown", s.onKeyDown);
  window.removeEventListener("keyup", s.onKeyUp);

  disposeModelResources(s.modelRoot);
  s.pointGeometry.dispose();
  s.pointMaterial.dispose();
  s.wireframeGeometry.dispose();
  s.wireframeMaterial.dispose();
  for (const material of s.textureRevealMaterials) {
    material.dispose();
  }
  for (const material of s.textureDepthMaterials) {
    material.dispose();
  }
  s.textureDepthRenderTarget.dispose();

  s.originMarker.geometry.dispose();
  if (s.originMarker.material instanceof THREE.Material) {
    s.originMarker.material.dispose();
  }
  s.wireOriginMarker.geometry.dispose();
  if (s.wireOriginMarker.material instanceof THREE.Material) {
    s.wireOriginMarker.material.dispose();
  }
  s.textureOriginMarker.geometry.dispose();
  if (s.textureOriginMarker.material instanceof THREE.Material) {
    s.textureOriginMarker.material.dispose();
  }
  s.pointDirectionHelper.dispose();
  s.wireDirectionHelper.dispose();
  s.textureDirectionHelper.dispose();

  s.originPath.geometry.dispose();
  if (s.originPath.material instanceof THREE.Material) {
    s.originPath.material.dispose();
  }

  s.grid.geometry.dispose();
  if (s.grid.material instanceof THREE.Material) {
    s.grid.material.dispose();
  }
}
