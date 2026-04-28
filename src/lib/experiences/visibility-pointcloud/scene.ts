import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { createPointcloudMaterial, createWireframeMaterial } from "./shaders";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";


const POINT_COUNT = 22_000;
const VISIBILITY_RAYS_PER_BATCH = 700;
const WIREFRAME_VISIBILITY_RAYS_PER_BATCH = 450;
const VISIBILITY_UPDATE_FRAME_INTERVAL = 2;
const VISIBILITY_EPSILON = 0.08;
const ORIGIN_RADIUS = 5.5;
const ORIGIN_HEIGHT = 2.3;
const ORIGIN_ORBIT_SPEED = 0.12;
const WIRE_ORIGIN_OFFSET = Math.PI / 2;
const CAMERA_ORBIT_SPEED = 1.5;
const CAMERA_ZOOM_SPEED = 4.5;
const CAMERA_MIN_RADIUS = 4;
const CAMERA_MAX_RADIUS = 16;
const CAMERA_HEIGHT = 3.2;

interface SampledSurface {
  allPositions: Float32Array;
  colors: Float32Array;
  worldPositions: Float32Array;
}

export interface VisibilityPointcloudState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  sourceMesh: THREE.Mesh;
  sourceGeometry: THREE.BufferGeometry;
  sourceMaterial: THREE.Material;
  allPointPositions: Float32Array;
  visibilityValues: Float32Array;
  worldPointPositions: Float32Array;
  pointGeometry: THREE.BufferGeometry;
  pointMaterial: THREE.ShaderMaterial;
  points: THREE.Points;
  wireframeGeometry: THREE.BufferGeometry;
  wireframeMaterial: THREE.ShaderMaterial;
  wireframe: THREE.LineSegments;
  wireframeVisibilityValues: Float32Array;
  wireframeWorldPositions: Float32Array;
  originMarker: THREE.Mesh;
  wireOriginMarker: THREE.Mesh;
  originPath: THREE.Line;
  raycaster: THREE.Raycaster;
  intersections: THREE.Intersection[];
  keys: Set<string>;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  frame: number;
  cameraAzimuth: number;
  cameraRadius: number;
  visibilityCursor: number;
  wireframeVisibilityCursor: number;
  visibleCount: number;
  wireframeVisibleCount: number;
}

const _originWorld = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _cameraTarget = new THREE.Vector3(0, 1.25, 0);
let bvhInstalled = false;

function installBVHRaycasting(): void {
  if (bvhInstalled) return;

  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  bvhInstalled = true;
}

function createSourceMesh(): THREE.Mesh {
  // Swap this geometry/material for your own mesh later. Keep the returned
  // object as a THREE.Mesh so the CPU line-of-sight raycasts can test it.
  const geometry = new THREE.TorusKnotGeometry(1.65, 0.46, 180, 36);
  const material = new THREE.MeshStandardMaterial({
    color: "#4f46e5",
    emissive: "#10143f",
    roughness: 0.58,
    metalness: 0.18,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 1.6, 0);
  mesh.rotation.set(0.35, -0.2, 0);
  mesh.renderOrder = 0;
  mesh.visible = false;
  mesh.updateMatrixWorld(true);
  return mesh;
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

function buildTriangleAreas(geometry: THREE.BufferGeometry): Float32Array {
  const triangleCount = getTriangleCount(geometry);
  const cumulativeAreas = new Float32Array(triangleCount);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  let totalArea = 0;
  for (let i = 0; i < triangleCount; i++) {
    readTriangleVertex(geometry, i, 0, a);
    readTriangleVertex(geometry, i, 1, b);
    readTriangleVertex(geometry, i, 2, c);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    totalArea += ab.cross(ac).length() * 0.5;
    cumulativeAreas[i] = totalArea;
  }

  return cumulativeAreas;
}

function findTriangleByArea(
  cumulativeAreas: Float32Array,
  target: number,
): number {
  let low = 0;
  let high = cumulativeAreas.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (target <= cumulativeAreas[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

function sampleSurfacePoints(mesh: THREE.Mesh, count: number): SampledSurface {
  const geometry = mesh.geometry;
  const cumulativeAreas = buildTriangleAreas(geometry);
  const totalArea = cumulativeAreas[cumulativeAreas.length - 1] ?? 0;
  const allPositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const worldPositions = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const color = new THREE.Color();
  const point = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();

  mesh.updateMatrixWorld(true);

  for (let i = 0; i < count; i++) {
    const triangleIndex = findTriangleByArea(
      cumulativeAreas,
      Math.random() * totalArea,
    );

    readTriangleVertex(geometry, triangleIndex, 0, a);
    readTriangleVertex(geometry, triangleIndex, 1, b);
    readTriangleVertex(geometry, triangleIndex, 2, c);

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

    allPositions[i * 3] = point.x;
    allPositions[i * 3 + 1] = point.y;
    allPositions[i * 3 + 2] = point.z;

    const heightMix = THREE.MathUtils.clamp((point.y + 2.1) / 4.2, 0, 1);
    const radialMix = Math.atan2(point.z, point.x) / (Math.PI * 2) + 0.5;
    color.setHSL(0.52 + radialMix * 0.18, 0.82, 0.48 + heightMix * 0.22);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    worldPoint.copy(point).applyMatrix4(mesh.matrixWorld);
    worldPositions[i * 3] = worldPoint.x;
    worldPositions[i * 3 + 1] = worldPoint.y;
    worldPositions[i * 3 + 2] = worldPoint.z;
  }

  return { allPositions, colors, worldPositions };
}

function buildWorldPositions(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
): Float32Array {
  const position = geometry.getAttribute("position");
  const worldPositions = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrixWorld);
    worldPositions[i * 3] = point.x;
    worldPositions[i * 3 + 1] = point.y;
    worldPositions[i * 3 + 2] = point.z;
  }

  return worldPositions;
}

function createOriginPath(): THREE.Line {
  const points: THREE.Vector3[] = [];
  const segments = 96;

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(t) * ORIGIN_RADIUS,
        ORIGIN_HEIGHT,
        Math.sin(t) * ORIGIN_RADIUS,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: "#2f6f77",
    transparent: true,
    opacity: 0.42,
  });

  return new THREE.Line(geometry, material);
}

function createOriginMarker(color: string, emissive: string): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.16, 24, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness: 0.45,
  });

  return new THREE.Mesh(geometry, material);
}

function updateCameraOrbit(
  state: VisibilityPointcloudState,
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

function isWorldPositionVisibleFromOrigin(
  state: VisibilityPointcloudState,
  worldPositions: Float32Array,
  index: number,
  originPosition: THREE.Vector3,
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

  _direction.divideScalar(distance);
  state.raycaster.set(originPosition, _direction);
  state.raycaster.near = 0.001;
  state.raycaster.far = distance + VISIBILITY_EPSILON;

  state.intersections.length = 0;
  state.raycaster.intersectObject(state.sourceMesh, false, state.intersections);

  const hit = state.intersections[0];
  return !!hit && Math.abs(hit.distance - distance) <= VISIBILITY_EPSILON;
}

function updateVisibilityBatch(state: VisibilityPointcloudState): void {
  const originPosition = state.originMarker.getWorldPosition(_originWorld);
  const visibilityAttribute = state.pointGeometry.getAttribute(
    "aVisibility",
  ) as THREE.BufferAttribute;
  let remaining = VISIBILITY_RAYS_PER_BATCH;
  let changed = false;

  while (remaining > 0) {
    const start = state.visibilityCursor;
    const count = Math.min(remaining, POINT_COUNT - start);
    let rangeChanged = false;

    for (let i = 0; i < count; i++) {
      const index = start + i;
      const wasVisible = state.visibilityValues[index] > 0.5;
      const isVisible = isWorldPositionVisibleFromOrigin(
        state,
        state.worldPointPositions,
        index,
        originPosition,
      );

      if (wasVisible !== isVisible) {
        state.visibilityValues[index] = isVisible ? 1 : 0;
        state.visibleCount += isVisible ? 1 : -1;
        rangeChanged = true;
      }
    }

    if (rangeChanged) {
      visibilityAttribute.addUpdateRange(start, count);
      changed = true;
    }

    state.visibilityCursor = (state.visibilityCursor + count) % POINT_COUNT;
    remaining -= count;
  }

  if (changed) {
    visibilityAttribute.needsUpdate = true;
  }
}

function updateWireframeVisibilityBatch(
  state: VisibilityPointcloudState,
): void {
  const originPosition = state.wireOriginMarker.getWorldPosition(_originWorld);
  const visibilityAttribute = state.wireframeGeometry.getAttribute(
    "aVisibility",
  ) as THREE.BufferAttribute;
  const wireframeCount = state.wireframeVisibilityValues.length;
  let remaining = WIREFRAME_VISIBILITY_RAYS_PER_BATCH;
  let changed = false;

  while (remaining > 0) {
    const start = state.wireframeVisibilityCursor;
    const count = Math.min(remaining, wireframeCount - start);
    let rangeChanged = false;

    for (let i = 0; i < count; i++) {
      const index = start + i;
      const wasVisible = state.wireframeVisibilityValues[index] > 0.5;
      const isVisible = isWorldPositionVisibleFromOrigin(
        state,
        state.wireframeWorldPositions,
        index,
        originPosition,
      );

      if (wasVisible !== isVisible) {
        state.wireframeVisibilityValues[index] = isVisible ? 1 : 0;
        state.wireframeVisibleCount += isVisible ? 1 : -1;
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
): Promise<VisibilityPointcloudState> {
  installBVHRaycasting();

  const sourceMesh = createSourceMesh();
  ctx.scene.add(sourceMesh);

  const sampled = sampleSurfacePoints(sourceMesh, POINT_COUNT);
  const visibilityValues = new Float32Array(POINT_COUNT);
  sourceMesh.geometry.computeBoundsTree({ maxLeafSize: 8 });

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(sampled.allPositions, 3),
  );
  pointGeometry.setAttribute(
    "aColor",
    new THREE.BufferAttribute(sampled.colors, 3),
  );
  pointGeometry.setAttribute(
    "aVisibility",
    new THREE.BufferAttribute(visibilityValues, 1),
  );
  pointGeometry.computeBoundingSphere();

  const pointMaterial = createPointcloudMaterial();
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.matrix.copy(sourceMesh.matrix);
  points.matrixAutoUpdate = false;
  points.renderOrder = 1;
  ctx.scene.add(points);

  const wireframeGeometry = new THREE.WireframeGeometry(sourceMesh.geometry);
  const wireframeVisibilityValues = new Float32Array(
    wireframeGeometry.getAttribute("position").count,
  );
  const wireframeWorldPositions = buildWorldPositions(
    wireframeGeometry,
    sourceMesh.matrixWorld,
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
  wireframe.matrix.copy(sourceMesh.matrix);
  wireframe.matrixAutoUpdate = false;
  wireframe.renderOrder = 2;
  ctx.scene.add(wireframe);

  const originMarker = createOriginMarker("#ffcc66", "#553300");
  originMarker.position.set(ORIGIN_RADIUS, ORIGIN_HEIGHT, 0);
  ctx.scene.add(originMarker);

  const wireOriginMarker = createOriginMarker("#ff5ad1", "#55103f");
  wireOriginMarker.position.set(0, ORIGIN_HEIGHT, ORIGIN_RADIUS);
  ctx.scene.add(wireOriginMarker);

  const originPath = createOriginPath();
  ctx.scene.add(originPath);

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

  ctx.camera.position.set(0, CAMERA_HEIGHT, 9);
  ctx.camera.lookAt(_cameraTarget);

  const state: VisibilityPointcloudState = {
    camera: ctx.camera,
    sourceMesh,
    sourceGeometry: sourceMesh.geometry,
    sourceMaterial: sourceMesh.material as THREE.Material,
    allPointPositions: sampled.allPositions,
    visibilityValues,
    worldPointPositions: sampled.worldPositions,
    pointGeometry,
    pointMaterial,
    points,
    wireframeGeometry,
    wireframeMaterial,
    wireframe,
    wireframeVisibilityValues,
    wireframeWorldPositions,
    originMarker,
    wireOriginMarker,
    originPath,
    raycaster: new THREE.Raycaster(),
    intersections: [],
    keys,
    onKeyDown,
    onKeyUp,
    frame: 0,
    cameraAzimuth: 0,
    cameraRadius: 9,
    visibilityCursor: 0,
    wireframeVisibilityCursor: 0,
    visibleCount: 0,
    wireframeVisibleCount: 0,
  };
  state.raycaster.firstHitOnly = true;

  for (let i = 0; i < Math.ceil(POINT_COUNT / VISIBILITY_RAYS_PER_BATCH); i++) {
    updateVisibilityBatch(state);
  }
  for (
    let i = 0;
    i <
    Math.ceil(
      wireframeVisibilityValues.length / WIREFRAME_VISIBILITY_RAYS_PER_BATCH,
    );
    i++
  ) {
    updateWireframeVisibilityBatch(state);
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
  const s = state as VisibilityPointcloudState;
  const t = ctx.elapsed * ORIGIN_ORBIT_SPEED;
  const wireT = t + WIRE_ORIGIN_OFFSET;

  s.originMarker.position.set(
    Math.cos(t) * ORIGIN_RADIUS,
    ORIGIN_HEIGHT + Math.sin(ctx.elapsed * 0.22) * 0.38,
    Math.sin(t) * ORIGIN_RADIUS,
  );
  s.wireOriginMarker.position.set(
    Math.cos(wireT) * ORIGIN_RADIUS,
    ORIGIN_HEIGHT + Math.sin(ctx.elapsed * 0.22 + WIRE_ORIGIN_OFFSET) * 0.38,
    Math.sin(wireT) * ORIGIN_RADIUS,
  );

  s.pointMaterial.uniforms.uOrigin.value.copy(
    s.originMarker.getWorldPosition(_originWorld),
  );
  s.wireframeMaterial.uniforms.uOrigin.value.copy(
    s.wireOriginMarker.getWorldPosition(_originWorld),
  );

  s.frame += 1;
  if (s.frame % VISIBILITY_UPDATE_FRAME_INTERVAL === 0) {
    updateVisibilityBatch(s);
    updateWireframeVisibilityBatch(s);
  }

  updateCameraOrbit(s, ctx.delta);

  return { state: s };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as VisibilityPointcloudState;

  scene.remove(s.sourceMesh);
  scene.remove(s.points);
  scene.remove(s.wireframe);
  scene.remove(s.originMarker);
  scene.remove(s.wireOriginMarker);
  scene.remove(s.originPath);

  window.removeEventListener("keydown", s.onKeyDown);
  window.removeEventListener("keyup", s.onKeyUp);

  s.sourceGeometry.disposeBoundsTree();
  s.sourceGeometry.dispose();
  s.sourceMaterial.dispose();
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

  s.originPath.geometry.dispose();
  if (s.originPath.material instanceof THREE.Material) {
    s.originPath.material.dispose();
  }
}
