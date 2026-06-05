import * as THREE from "three";

export const EXTERNAL_INPUT_GRACE_MS = 250;

const MOVE_SPEED = 40;
const VERTICAL_MOVE_SPEED = 30;
const MOVE_RESPONSE = 8;
const ROTATION_RESPONSE = 10;
const MAX_YAW_SPEED = 1.8;
const MAX_PITCH_SPEED = 1.2;
const MAX_PITCH = Math.PI / 2 - 0.05;

export interface KeyboardCameraControls {
  keys: Set<string>;
  moveVelocity: THREE.Vector3;
  pitch: number;
  pitchVelocity: number;
  yaw: number;
  yawVelocity: number;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

const CONTROL_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "q",
  "e",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _movement = new THREE.Vector3();
const _targetMovement = new THREE.Vector3();
const _rotation = new THREE.Euler(0, 0, 0, "YXZ");

export function createKeyboardCameraControls(
  camera: THREE.PerspectiveCamera,
): KeyboardCameraControls {
  camera.rotation.order = "YXZ";
  _rotation.setFromQuaternion(camera.quaternion, "YXZ");

  const controls: KeyboardCameraControls = {
    keys: new Set<string>(),
    moveVelocity: new THREE.Vector3(),
    pitch: _rotation.x,
    pitchVelocity: 0,
    yaw: _rotation.y,
    yawVelocity: 0,
    onBlur: () => {
      controls.keys.clear();
      controls.moveVelocity.set(0, 0, 0);
      controls.pitchVelocity = 0;
      controls.yawVelocity = 0;
    },
    onKeyDown: (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      if (!CONTROL_KEYS.has(key)) {
        return;
      }
      event.preventDefault();
      controls.keys.add(key);
    },
    onKeyUp: (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      if (!CONTROL_KEYS.has(key)) {
        return;
      }
      event.preventDefault();
      controls.keys.delete(key);
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
  const responseAlpha = 1 - Math.exp(-ROTATION_RESPONSE * delta);
  const targetYawVelocity =
    (controls.keys.has("arrowleft") ? 1 : 0) * MAX_YAW_SPEED +
    (controls.keys.has("arrowright") ? -1 : 0) * MAX_YAW_SPEED;
  const targetPitchVelocity =
    (controls.keys.has("arrowup") ? 1 : 0) * MAX_PITCH_SPEED +
    (controls.keys.has("arrowdown") ? -1 : 0) * MAX_PITCH_SPEED;

  controls.yawVelocity = THREE.MathUtils.lerp(
    controls.yawVelocity,
    targetYawVelocity,
    responseAlpha,
  );
  controls.pitchVelocity = THREE.MathUtils.lerp(
    controls.pitchVelocity,
    targetPitchVelocity,
    responseAlpha,
  );

  controls.yaw += controls.yawVelocity * delta;
  controls.pitch = THREE.MathUtils.clamp(
    controls.pitch + controls.pitchVelocity * delta,
    -MAX_PITCH,
    MAX_PITCH,
  );
  if (controls.pitch === -MAX_PITCH || controls.pitch === MAX_PITCH) {
    controls.pitchVelocity = 0;
  }

  camera.rotation.set(controls.pitch, controls.yaw, 0, "YXZ");

  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _targetMovement.set(0, 0, 0);

  if (controls.keys.has("w")) {
    _targetMovement.add(_forward);
  }
  if (controls.keys.has("s")) {
    _targetMovement.sub(_forward);
  }
  if (controls.keys.has("d")) {
    _targetMovement.add(_right);
  }
  if (controls.keys.has("a")) {
    _targetMovement.sub(_right);
  }
  if (controls.keys.has("e")) {
    _targetMovement.y += 1;
  }
  if (controls.keys.has("q")) {
    _targetMovement.y -= 1;
  }

  if (_targetMovement.lengthSq() > 0) {
    const horizontalLength = Math.hypot(_targetMovement.x, _targetMovement.z);
    if (horizontalLength > 0) {
      const horizontalScale = MOVE_SPEED / horizontalLength;
      _targetMovement.x *= horizontalScale;
      _targetMovement.z *= horizontalScale;
    }

    if (_targetMovement.y !== 0) {
      _targetMovement.y = Math.sign(_targetMovement.y) * VERTICAL_MOVE_SPEED;
    }
  }

  const movementAlpha = 1 - Math.exp(-MOVE_RESPONSE * delta);
  controls.moveVelocity.lerp(_targetMovement, movementAlpha);
  _movement.copy(controls.moveVelocity).multiplyScalar(delta);
  camera.position.add(_movement);
}

export function hasKeyboardCameraInput(
  controls: KeyboardCameraControls,
): boolean {
  return controls.keys.size > 0;
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
