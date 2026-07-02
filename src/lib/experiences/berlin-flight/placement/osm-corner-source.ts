import * as THREE from "three";
import { BERLIN_PLACEMENT } from "./config";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import type { BerlinPlacementBuildingSource } from "./types";

export function collectNearbyBerlinBuildingSources(
  trackedMeshes: readonly TrackedTileMesh[],
  playerPosition: THREE.Vector3,
): readonly BerlinPlacementBuildingSource[] {
  const scanRadius = BERLIN_PLACEMENT.SCAN_RADIUS;
  const nearbySources: Array<{
    distanceSq: number;
    source: BerlinPlacementBuildingSource;
  }> = [];

  for (const trackedMesh of trackedMeshes) {
    const maxDistance = scanRadius + trackedMesh.worldSphere.radius;
    const distanceSq =
      trackedMesh.worldSphere.center.distanceToSquared(playerPosition);
    if (distanceSq > maxDistance * maxDistance) {
      continue;
    }

    const sourceKey = createFallbackBuildingKey(trackedMesh);
    nearbySources.push({
      distanceSq,
      source: {
        buildingId: sourceKey,
        sourceKey,
        mesh: trackedMesh.mesh,
        geometry: trackedMesh.geometry,
        metadata: {
          osmId: null,
          featureId: null,
          sourceLayer: null,
        },
      },
    });
  }

  nearbySources.sort(compareNearbySources);
  return nearbySources.map((entry) => entry.source);
}

function compareNearbySources(
  left: { distanceSq: number; source: BerlinPlacementBuildingSource },
  right: { distanceSq: number; source: BerlinPlacementBuildingSource },
): number {
  if (left.distanceSq !== right.distanceSq) {
    return left.distanceSq - right.distanceSq;
  }

  return left.source.sourceKey.localeCompare(right.source.sourceKey);
}

function createFallbackBuildingKey(trackedMesh: TrackedTileMesh): string {
  const center = trackedMesh.worldSphere.center;
  const size = trackedMesh.localBounds.getSize(new THREE.Vector3());
  return [
    trackedMesh.sourceUrl,
    quantize(center.x),
    quantize(center.y),
    quantize(center.z),
    quantize(size.x),
    quantize(size.y),
    quantize(size.z),
  ].join(":");
}

function quantize(value: number): string {
  return Math.round(value * 10).toString();
}
