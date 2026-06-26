import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import type { BerlinConeMeshNeighborhood } from "./types";
import type { BerlinAcceptedShadowOriginPoint } from "../placement/types";

const downAxis = new THREE.Vector3(0, -1, 0);
const scratchOutward = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();

export function solveBerlinConeAxisDirection(
  point: BerlinAcceptedShadowOriginPoint,
  neighborhood: BerlinConeMeshNeighborhood | null,
): THREE.Vector3 | null {
  void point;

  if (!neighborhood) {
    return null;
  }

  const horizontalLength = neighborhood.horizontalDirectionToGeometry.length();
  const geometryLength = neighborhood.directionToGeometry.length();

  if (!Number.isFinite(horizontalLength) || !Number.isFinite(geometryLength)) {
    return null;
  }

  if (geometryLength === 0 || horizontalLength === 0) {
    return null;
  }

  const horizontalStrength = horizontalLength / geometryLength;
  if (horizontalStrength < BERLIN_CONE_PLACEMENT.AMBIGUITY_THRESHOLD) {
    return null;
  }

  scratchOutward
    .copy(neighborhood.horizontalDirectionToGeometry)
    .multiplyScalar(-1);

  if (scratchOutward.lengthSq() === 0) {
    return null;
  }

  scratchOutward.normalize();

  const tiltRadians = getTiltRadians(horizontalStrength);
  scratchAxis
    .copy(downAxis)
    .multiplyScalar(Math.cos(tiltRadians))
    .addScaledVector(scratchOutward, Math.sin(tiltRadians));

  const axisLengthSq = scratchAxis.lengthSq();
  if (axisLengthSq === 0 || !Number.isFinite(axisLengthSq)) {
    return null;
  }

  scratchAxis.normalize();

  if (scratchAxis.y >= 0) {
    return null;
  }

  return scratchAxis.clone();
}

function getTiltRadians(horizontalStrength: number): number {
  const clampedStrength = THREE.MathUtils.clamp(horizontalStrength, 0, 1);
  const minTilt = BERLIN_CONE_PLACEMENT.MIN_TILT_DEGREES;
  const maxTilt = BERLIN_CONE_PLACEMENT.MAX_TILT_DEGREES;
  const threshold = BERLIN_CONE_PLACEMENT.AMBIGUITY_THRESHOLD;
  const normalizedStrength =
    threshold >= 1
      ? 0
      : THREE.MathUtils.clamp(
          (clampedStrength - threshold) / (1 - threshold),
          0,
          1,
        );
  const tiltDegrees = THREE.MathUtils.lerp(minTilt, maxTilt, normalizedStrength);

  return THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(tiltDegrees, minTilt, maxTilt),
  );
}
