export const M5_DEVICE_MESSAGE_TYPES = [
  "register",
  "heartbeat",
  "imu",
  "orientation",
] as const;

const M5_MIN_QUALITY = 0;
const M5_MAX_QUALITY = 1;

let syntheticSequence = 0;

export type M5DeviceMessageType = (typeof M5_DEVICE_MESSAGE_TYPES)[number];
export type M5DeviceRole = "controller";

export interface M5Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface M5BaseDeviceMessage {
  type: M5DeviceMessageType;
  deviceId: string;
  role: M5DeviceRole;
  seq: number;
  timeMs: number;
  quality: number;
}

type M5BaseDeviceRecord = M5BaseDeviceMessage & Record<string, unknown>;

export interface M5RegisterMessage extends M5BaseDeviceMessage {
  type: "register";
  firmwareVersion: string;
  capabilities: string[];
}

export interface M5HeartbeatMessage extends M5BaseDeviceMessage {
  type: "heartbeat";
  rssi: number;
  freeHeap: number;
  batteryVoltage: number;
  uptimeMs: number;
  calibrated: boolean;
  streaming: boolean;
}

export interface M5ImuMessage extends M5BaseDeviceMessage {
  type: "imu";
  accel: M5Vector3;
  gyro: M5Vector3;
}

export interface M5OrientationMessage extends M5BaseDeviceMessage {
  type: "orientation";
  pitch: number;
  roll: number;
  yaw: number;
}

export type M5DeviceMessage =
  | M5RegisterMessage
  | M5HeartbeatMessage
  | M5ImuMessage
  | M5OrientationMessage;

export function parseM5DeviceMessage(raw: string): M5DeviceMessage {
  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid M5 message: invalid JSON");
  }

  if (isM5DeviceMessage(data)) return data;

  const normalizedData = normalizeLegacyM5DeviceMessage(data);
  if (normalizedData) return normalizedData;

  throw new Error(`Invalid M5 message: ${describeInvalidMessage(data)}`);
}

export function isM5DeviceMessage(data: unknown): data is M5DeviceMessage {
  return (
    isM5RegisterMessage(data) ||
    isM5HeartbeatMessage(data) ||
    isM5ImuMessage(data) ||
    isM5OrientationMessage(data)
  );
}

export function isM5RegisterMessage(data: unknown): data is M5RegisterMessage {
  if (!hasM5BaseFields(data, "register")) return false;
  return (
    isNonEmptyString(data.firmwareVersion) &&
    Array.isArray(data.capabilities) &&
    data.capabilities.every(isNonEmptyString)
  );
}

export function isM5HeartbeatMessage(
  data: unknown,
): data is M5HeartbeatMessage {
  if (!hasM5BaseFields(data, "heartbeat")) return false;
  return (
    isFiniteNumber(data.rssi) &&
    isFiniteNonNegativeNumber(data.freeHeap) &&
    isFiniteNonNegativeNumber(data.batteryVoltage) &&
    isFiniteNonNegativeNumber(data.uptimeMs) &&
    typeof data.calibrated === "boolean" &&
    typeof data.streaming === "boolean"
  );
}

export function isM5ImuMessage(data: unknown): data is M5ImuMessage {
  if (!hasM5BaseFields(data, "imu")) return false;
  return isM5Vector3(data.accel) && isM5Vector3(data.gyro);
}

export function isM5OrientationMessage(
  data: unknown,
): data is M5OrientationMessage {
  if (!hasM5BaseFields(data, "orientation")) return false;
  return (
    isFiniteNumber(data.pitch) &&
    isFiniteNumber(data.roll) &&
    isFiniteNumber(data.yaw)
  );
}

function hasM5BaseFields(
  data: unknown,
  type: M5DeviceMessageType,
): data is M5BaseDeviceRecord {
  return (
    isRecord(data) &&
    data.type === type &&
    isNonEmptyString(data.deviceId) &&
    data.role === "controller" &&
    isPositiveInteger(data.seq) &&
    isFiniteNonNegativeNumber(data.timeMs) &&
    isNumberInRange(data.quality, M5_MIN_QUALITY, M5_MAX_QUALITY)
  );
}

function normalizeLegacyM5DeviceMessage(data: unknown): M5DeviceMessage | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;

  const base = normalizeLegacyBaseFields(data);
  if (!base) return null;

  if (data.type === "orientation") {
    if (!isFiniteNumber(data.pitch) || !isFiniteNumber(data.roll)) return null;
    return {
      ...base,
      type: "orientation",
      pitch: data.pitch,
      roll: data.roll,
      yaw: isFiniteNumber(data.yaw) ? data.yaw : 0,
    };
  }

  if (data.type === "heartbeat") {
    if (!isFiniteNumber(data.rssi)) return null;

    return {
      ...base,
      type: "heartbeat",
      rssi: data.rssi,
      freeHeap: isFiniteNonNegativeNumber(data.freeHeap) ? data.freeHeap : 0,
      batteryVoltage: isFiniteNonNegativeNumber(data.batteryVoltage)
        ? data.batteryVoltage
        : 0,
      uptimeMs: isFiniteNonNegativeNumber(data.uptimeMs)
        ? data.uptimeMs
        : base.timeMs,
      calibrated:
        typeof data.calibrated === "boolean" ? data.calibrated : false,
      streaming: typeof data.streaming === "boolean" ? data.streaming : true,
    };
  }

  if (data.type === "register") {
    if (!isNonEmptyString(data.firmwareVersion)) return null;
    return {
      ...base,
      type: "register",
      firmwareVersion: data.firmwareVersion,
      capabilities:
        Array.isArray(data.capabilities) &&
        data.capabilities.every(isNonEmptyString)
          ? data.capabilities
          : [],
    };
  }

  if (data.type === "imu") {
    if (!isM5Vector3(data.accel) || !isM5Vector3(data.gyro)) return null;
    return {
      ...base,
      type: "imu",
      accel: data.accel,
      gyro: data.gyro,
    };
  }

  return null;
}

function normalizeLegacyBaseFields(
  data: Record<string, unknown>,
): M5BaseDeviceMessage | null {
  if (!isNonEmptyString(data.deviceId)) return null;
  if (data.role !== undefined && data.role !== "controller") return null;

  return {
    type: isM5DeviceMessageType(data.type) ? data.type : "orientation",
    deviceId: data.deviceId,
    role: "controller",
    seq: isPositiveInteger(data.seq) ? data.seq : nextSyntheticSequence(),
    timeMs: isFiniteNonNegativeNumber(data.timeMs) ? data.timeMs : Date.now(),
    quality: isNumberInRange(data.quality, M5_MIN_QUALITY, M5_MAX_QUALITY)
      ? data.quality
      : 1,
  };
}

function nextSyntheticSequence(): number {
  syntheticSequence += 1;
  return syntheticSequence;
}

function isM5DeviceMessageType(data: unknown): data is M5DeviceMessageType {
  return (
    typeof data === "string" &&
    (M5_DEVICE_MESSAGE_TYPES as readonly string[]).includes(data)
  );
}

function isM5Vector3(data: unknown): data is M5Vector3 {
  return (
    isRecord(data) &&
    isFiniteNumber(data.x) &&
    isFiniteNumber(data.y) &&
    isFiniteNumber(data.z)
  );
}

function describeInvalidMessage(data: unknown): string {
  if (!isRecord(data)) return "message must be a JSON object";
  if (typeof data.type !== "string") return "type must be a string";
  return `unsupported shape for type "${data.type}"`;
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function isNonEmptyString(data: unknown): data is string {
  return typeof data === "string" && data.trim().length > 0;
}

function isFiniteNumber(data: unknown): data is number {
  return typeof data === "number" && Number.isFinite(data);
}

function isFiniteNonNegativeNumber(data: unknown): data is number {
  return isFiniteNumber(data) && data >= 0;
}

function isPositiveInteger(data: unknown): data is number {
  return typeof data === "number" && Number.isInteger(data) && data > 0;
}

function isNumberInRange(
  data: unknown,
  minimum: number,
  maximum: number,
): data is number {
  return isFiniteNumber(data) && data >= minimum && data <= maximum;
}
