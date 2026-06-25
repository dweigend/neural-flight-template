import * as THREE from "three";
import type { BerlinState } from "../types";

const TILE_SELECTION_FOV = 110;
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

export function createTileSelectionCamera(
  referenceCamera: THREE.PerspectiveCamera,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    Math.max(referenceCamera.fov, TILE_SELECTION_FOV),
    referenceCamera.aspect || 1,
    referenceCamera.near,
    referenceCamera.far,
  );
  camera.updateProjectionMatrix();
  return camera;
}

export function getTileSelectionCameras(
  state: BerlinState,
): readonly THREE.Camera[] {
  return [state.tileSelectionCamera];
}

export function syncTileSelectionCamera(state: BerlinState): void {
  const viewCamera = getTileSelectionViewCamera(state);
  const tileSelectionCamera = state.tileSelectionCamera;

  viewCamera.matrixWorld.decompose(
    scratchPosition,
    scratchQuaternion,
    scratchScale,
  );

  tileSelectionCamera.position.copy(scratchPosition);
  tileSelectionCamera.quaternion.copy(scratchQuaternion);

  const nextFov = Math.max(state.camera.fov, TILE_SELECTION_FOV);
  const nextAspect = state.camera.aspect || 1;
  if (
    tileSelectionCamera.near !== state.camera.near ||
    tileSelectionCamera.far !== state.camera.far ||
    tileSelectionCamera.fov !== nextFov ||
    tileSelectionCamera.aspect !== nextAspect
  ) {
    tileSelectionCamera.near = state.camera.near;
    tileSelectionCamera.far = state.camera.far;
    tileSelectionCamera.fov = nextFov;
    tileSelectionCamera.aspect = nextAspect;
    tileSelectionCamera.updateProjectionMatrix();
  }

  tileSelectionCamera.updateMatrixWorld(true);
}

function getTileSelectionViewCamera(state: BerlinState): THREE.Camera {
  if (!state.renderer.xr.isPresenting) {
    state.camera.updateMatrixWorld(true);
    return state.camera;
  }

  state.renderer.xr.updateCamera(state.camera);
  return state.renderer.xr.getCamera();
}
