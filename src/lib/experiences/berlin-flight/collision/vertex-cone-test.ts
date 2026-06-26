import * as THREE from "three";
import type { BerlinConeVolume } from "./types";

export function isVertexInsideCone(
  position: THREE.Vector3,
  cone: BerlinConeVolume,
): boolean {
  const baseY = cone.baseCenter.y;
  const topY = cone.tip.y;

  if (position.y < baseY) return false;
  if (position.y > topY) return false;

  const t = (position.y - baseY) / cone.height;
  const allowedRadius = cone.radius * (1 - t);
  const deltaX = position.x - cone.baseCenter.x;
  const deltaZ = position.z - cone.baseCenter.z;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  return distanceSq <= allowedRadius * allowedRadius;
}
