import * as THREE from "three";
import type { BerlinConeVolume } from "../collision/types";
import { BERLIN_CONE_GRID } from "../runtime/cone-grid-config";
import type { BerlinAcceptedShadowOriginPoint } from "../placement/types";

const scratchBaseCenter = new THREE.Vector3();

export function createBerlinConeVolume(
  point: BerlinAcceptedShadowOriginPoint,
  axisDirection: THREE.Vector3,
  chunkKey: string = point.sourceKey,
  coneIndex: number = point.cornerIndex,
): BerlinConeVolume {
  const tip = point.worldPosition.clone();
  const baseCenter = scratchBaseCenter
    .copy(point.worldPosition)
    .addScaledVector(axisDirection, BERLIN_CONE_GRID.CONE_HEIGHT)
    .clone();

  return {
    tip,
    axisDirection: axisDirection.clone(),
    height: BERLIN_CONE_GRID.CONE_HEIGHT,
    radius: BERLIN_CONE_GRID.CONE_RADIUS,
    baseCenter,
    placementPointId: point.pointId,
    sourceBuildingId: point.buildingId,
    chunkKey,
    coneIndex,
  };
}
