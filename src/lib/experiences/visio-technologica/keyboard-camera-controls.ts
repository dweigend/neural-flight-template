import * as THREE from "three";

export const EXTERNAL_INPUT_GRACE_MS = 250;

const MOVE_SPEED = 8;
const VERTICAL_MOVE_SPEED = 5;
const YAW_SPEED = 1.8;
const PITCH_SPEED = 1.2;
const MAX_PITCH = Math.PI / 2 - 0.05;

export interface KeyboardCameraControls {
  keys: Set<string>;
  pitch: number;
  yaw: number;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _movement = new THREE.Vector3();
const _rotation = new THREE.Euler(0, 0, 0, "YXZ");

export function createKeyboardCameraControls(
  camera: THREE.PerspectiveCamera,
): KeyboardCameraControls {
  camera.rotation.order = "YXZ";
  _rotation.setFromQuaternion(camera.quaternion, "YXZ");

  const controls: KeyboardCameraControls = {
    keys: new Set<string>(),
    pitch: _rotation.x,
    yaw: _rotation.y,
    onBlur: () => {
      controls.keys.clear();
    },
    onKeyDown: (event: KeyboardEvent) => {
      controls.keys.add(normalizeKey(event.key));
    },
    onKeyUp: (event: KeyboardEvent) => {
      controls.keys.delete(normalizeKey(event.key));
    },
  };

  window.addEventListener("keydown", controls.onKeyDown);
  window.addEventListener("keyup", controls.onKeyUp);
  window.addEventListener("blur", controls.onBlur);

  return controls;
}

export function updateKeyboardCameraControls(
  controls: KeyboardCameraControls,
  camera: THREE.PerspectiveCamera,
  delta: number,
): void {
  if (controls.keys.has("arrowleft")) {
    controls.yaw += YAW_SPEED * delta;
  }
  if (controls.keys.has("arrowright")) {
    controls.yaw -= YAW_SPEED * delta;
  }
  if (controls.keys.has("arrowup")) {
    controls.pitch += PITCH_SPEED * delta;
  }
  if (controls.keys.has("arrowdown")) {
    controls.pitch -= PITCH_SPEED * delta;
  }

  controls.pitch = THREE.MathUtils.clamp(controls.pitch, -MAX_PITCH, MAX_PITCH);
  camera.rotation.set(controls.pitch, controls.yaw, 0, "YXZ");

  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _movement.set(0, 0, 0);

  if (controls.keys.has("w")) {
    _movement.add(_forward);
  }
  if (controls.keys.has("s")) {
    _movement.sub(_forward);
  }
  if (controls.keys.has("d")) {
    _movement.add(_right);
  }
  if (controls.keys.has("a")) {
    _movement.sub(_right);
  }
  if (controls.keys.has("e")) {
    _movement.y += 1;
  }
  if (controls.keys.has("q")) {
    _movement.y -= 1;
  }

  if (_movement.lengthSq() === 0) {
    return;
  }

  const verticalInput = Math.abs(_movement.y) > 0 ? Math.sign(_movement.y) : 0;
  _movement.y = 0;

  if (_movement.lengthSq() > 0) {
    _movement.normalize().multiplyScalar(MOVE_SPEED * delta);
    camera.position.add(_movement);
  }

  if (verticalInput !== 0) {
    camera.position.y += verticalInput * VERTICAL_MOVE_SPEED * delta;
  }
}

export function disposeKeyboardCameraControls(
  controls: KeyboardCameraControls,
): void {
  window.removeEventListener("keydown", controls.onKeyDown);
  window.removeEventListener("keyup", controls.onKeyUp);
  window.removeEventListener("blur", controls.onBlur);
  controls.keys.clear();
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}
