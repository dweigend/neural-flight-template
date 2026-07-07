import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { updateTrackedMeshWorldSphere } from "../collision/cone-mesh-bounds";
import type {
  BerlinConeSourceMeshFile,
  BerlinConeSourceMeshRecord,
} from "./source-contracts";

export interface BerlinConeSourceExportOptions {
  center: {
    x: number;
    z: number;
  };
  radiusMeters: number;
}

export interface BerlinConeSourceExportResult {
  file: BerlinConeSourceMeshFile;
  sourceMeshesInRadius: number;
  trackedMeshesSeen: number;
}

export function buildBerlinConeSourceMeshFile(
  trackedMeshes: readonly TrackedTileMesh[],
  options: BerlinConeSourceExportOptions,
): BerlinConeSourceExportResult {
  const radiusSq = options.radiusMeters * options.radiusMeters;
  const meshes = trackedMeshes
    .filter((trackedMesh) => {
      updateTrackedMeshWorldSphere(trackedMesh);
      const deltaX = trackedMesh.worldSphere.center.x - options.center.x;
      const deltaZ = trackedMesh.worldSphere.center.z - options.center.z;
      return deltaX * deltaX + deltaZ * deltaZ <= radiusSq;
    })
    .sort(compareTrackedMeshes)
    .map(createBerlinConeSourceMeshRecord);

  return {
    file: {
      version: 1,
      meshes,
    },
    sourceMeshesInRadius: meshes.length,
    trackedMeshesSeen: trackedMeshes.length,
  };
}

export function createBerlinConeSourceMeshRecord(
  trackedMesh: TrackedTileMesh,
): BerlinConeSourceMeshRecord {
  trackedMesh.mesh.updateWorldMatrix(true, false);

  return {
    positions: Array.from(trackedMesh.positions),
    matrixWorld: Array.from(trackedMesh.mesh.matrixWorld.elements),
    sourceUrl: trackedMesh.sourceUrl,
  };
}

function compareTrackedMeshes(left: TrackedTileMesh, right: TrackedTileMesh): number {
  if (left.sourceUrl !== right.sourceUrl) {
    return left.sourceUrl.localeCompare(right.sourceUrl);
  }

  if (left.worldSphere.center.x !== right.worldSphere.center.x) {
    return left.worldSphere.center.x - right.worldSphere.center.x;
  }

  return left.worldSphere.center.z - right.worldSphere.center.z;
}
