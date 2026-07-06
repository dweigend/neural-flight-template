import * as THREE from "three";
import { preprocessTrackedMesh } from "../collision/mesh-preprocess";
import type { TrackedTileMesh } from "../collision/tile-mesh-types";
import { createBerlinConeVolume } from "../cone-placement/cone-volume";
import { sampleBerlinMeshNeighborhood } from "../cone-placement/mesh-neighborhood";
import { solveBerlinConeAxisDirection } from "../cone-placement/orientation-solver";
import { extractBerlinRoofCornerCandidates } from "../placement/corner-extractor";
import {
  filterBerlinRoofCornerCandidates,
  type BerlinDensitySampler,
} from "../placement/corner-filter";
import type { BerlinPlacementBuildingSource } from "../placement/types";
import type {
  BerlinConeChunkData,
  BerlinConeDatasetManifest,
} from "./contracts";
import {
  BERLIN_CONE_CHUNK_SIZE_METERS,
  getConeChunkCoordinate,
  getConeChunkKey,
  parseConeChunkKey,
  type BerlinConeChunkKey,
} from "../runtime/cone-grid-coordinates";

type MutableChunkBuffers = {
  chunkKey: BerlinConeChunkKey;
  chunkWorldMinX: number;
  chunkWorldMinZ: number;
  positions: number[];
  scalars: number[];
  coneIndex: number[];
};

export interface BerlinConeDatasetBuildStats {
  sourceMeshes: number;
  scannedBuildings: number;
  rawCandidates: number;
  stagedCandidates: number;
  rejectedByDensity: number;
  rejectedBySpacing: number;
  acceptedPoints: number;
  generatedCones: number;
  skippedMissingNeighborhood: number;
  skippedAmbiguousDirection: number;
}

export interface BerlinConeDatasetBuildResult {
  manifest: BerlinConeDatasetManifest;
  chunks: ReadonlyMap<BerlinConeChunkKey, BerlinConeChunkData>;
  stats: BerlinConeDatasetBuildStats;
}

export function buildBerlinConeDataset(input: {
  trackedMeshes: readonly TrackedTileMesh[];
  densitySampler: BerlinDensitySampler | null;
  radiusFilter?: {
    center: {
      x: number;
      z: number;
    };
    radiusMeters: number;
  };
}): BerlinConeDatasetBuildResult {
  const filteredMeshes = filterTrackedMeshesByRadius(
    input.trackedMeshes,
    input.radiusFilter,
  );
  const buildingSources = filteredMeshes.map(createOfflineBuildingSource);
  const candidates = buildingSources.flatMap((source) =>
    extractBerlinRoofCornerCandidates(source),
  );
  const filterResult = filterBerlinRoofCornerCandidates(
    candidates,
    input.densitySampler,
  );
  const chunkBuffers = new Map<BerlinConeChunkKey, MutableChunkBuffers>();
  let generatedCones = 0;
  let skippedMissingNeighborhood = 0;
  let skippedAmbiguousDirection = 0;

  for (const point of filterResult.acceptedPoints) {
    const neighborhood = sampleBerlinMeshNeighborhood(point, filteredMeshes);
    if (!neighborhood) {
      skippedMissingNeighborhood += 1;
      continue;
    }

    const axisDirection = solveBerlinConeAxisDirection(point, neighborhood);
    if (!axisDirection) {
      skippedAmbiguousDirection += 1;
      continue;
    }

    const chunkCoordinate = getConeChunkCoordinate(point.worldPosition);
    const chunkKey = getConeChunkKey(chunkCoordinate);
    const cone = createBerlinConeVolume(
      point,
      axisDirection,
      chunkKey,
      generatedCones,
    );
    const chunk = getOrCreateChunkBuffer(chunkBuffers, chunkKey);
    chunk.positions.push(
      cone.tip.x,
      cone.tip.y,
      cone.tip.z,
      cone.axisDirection.x,
      cone.axisDirection.y,
      cone.axisDirection.z,
    );
    chunk.scalars.push(cone.radius, cone.height);
    chunk.coneIndex.push(cone.coneIndex);
    generatedCones += 1;
  }

  const chunks = new Map<BerlinConeChunkKey, BerlinConeChunkData>();

  for (const [chunkKey, chunk] of chunkBuffers) {
    chunks.set(chunkKey, {
      chunkKey,
      chunkWorldMinX: chunk.chunkWorldMinX,
      chunkWorldMinZ: chunk.chunkWorldMinZ,
      chunkSizeMeters: BERLIN_CONE_CHUNK_SIZE_METERS,
      positions: Float32Array.from(chunk.positions),
      scalars: Float32Array.from(chunk.scalars),
      coneIndex: Int32Array.from(chunk.coneIndex),
    });
  }

  return {
    manifest: createManifest(chunks.keys()),
    chunks,
    stats: {
      sourceMeshes: filteredMeshes.length,
      scannedBuildings: buildingSources.length,
      rawCandidates: candidates.length,
      stagedCandidates: filterResult.stagedCandidates,
      rejectedByDensity: candidates.length - filterResult.stagedCandidates,
      rejectedBySpacing: filterResult.rejectedBySpacing,
      acceptedPoints: filterResult.acceptedPoints.length,
      generatedCones,
      skippedMissingNeighborhood,
      skippedAmbiguousDirection,
    },
  };
}

export function createTrackedMeshFromOfflineGeometry(input: {
  positions: readonly number[];
  matrixWorld?: readonly number[];
  sourceUrl: string;
}): TrackedTileMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(input.positions, 3),
  );
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  if (input.matrixWorld && input.matrixWorld.length === 16) {
    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(input.matrixWorld);
    mesh.matrixWorld.copy(mesh.matrix);
  } else {
    mesh.updateMatrixWorld(true);
  }

  const trackedMesh = preprocessTrackedMesh(mesh, material);
  if (!trackedMesh) {
    throw new Error(
      `[BerlinFlight] Could not preprocess offline cone source mesh: ${input.sourceUrl}`,
    );
  }

  trackedMesh.sourceUrl = input.sourceUrl;
  return trackedMesh;
}

function filterTrackedMeshesByRadius(
  trackedMeshes: readonly TrackedTileMesh[],
  radiusFilter:
    | {
        center: {
          x: number;
          z: number;
        };
        radiusMeters: number;
      }
    | undefined,
): readonly TrackedTileMesh[] {
  if (!radiusFilter) {
    return trackedMeshes;
  }

  const radiusSq = radiusFilter.radiusMeters * radiusFilter.radiusMeters;

  return trackedMeshes.filter((trackedMesh) => {
    const deltaX = trackedMesh.worldSphere.center.x - radiusFilter.center.x;
    const deltaZ = trackedMesh.worldSphere.center.z - radiusFilter.center.z;
    return deltaX * deltaX + deltaZ * deltaZ <= radiusSq;
  });
}

function createOfflineBuildingSource(
  trackedMesh: TrackedTileMesh,
  index: number,
): BerlinPlacementBuildingSource {
  const buildingId = `${trackedMesh.sourceUrl}#${index}`;
  return {
    buildingId,
    sourceKey: buildingId,
    mesh: trackedMesh.mesh,
    geometry: trackedMesh.geometry,
    metadata: {
      osmId: null,
      featureId: null,
      sourceLayer: null,
    },
  };
}

function getOrCreateChunkBuffer(
  chunks: Map<BerlinConeChunkKey, MutableChunkBuffers>,
  chunkKey: BerlinConeChunkKey,
): MutableChunkBuffers {
  const existing = chunks.get(chunkKey);
  if (existing) {
    return existing;
  }

  const coordinate = parseConeChunkKey(chunkKey);
  const created: MutableChunkBuffers = {
    chunkKey,
    chunkWorldMinX: coordinate.x * BERLIN_CONE_CHUNK_SIZE_METERS,
    chunkWorldMinZ: coordinate.z * BERLIN_CONE_CHUNK_SIZE_METERS,
    positions: [],
    scalars: [],
    coneIndex: [],
  };
  chunks.set(chunkKey, created);
  return created;
}

function createManifest(
  chunkKeys: Iterable<BerlinConeChunkKey>,
): BerlinConeDatasetManifest {
  let minChunkX = Number.POSITIVE_INFINITY;
  let maxChunkX = Number.NEGATIVE_INFINITY;
  let minChunkZ = Number.POSITIVE_INFINITY;
  let maxChunkZ = Number.NEGATIVE_INFINITY;
  let chunkCount = 0;

  for (const chunkKey of chunkKeys) {
    const coordinate = parseConeChunkKey(chunkKey);
    minChunkX = Math.min(minChunkX, coordinate.x);
    maxChunkX = Math.max(maxChunkX, coordinate.x);
    minChunkZ = Math.min(minChunkZ, coordinate.z);
    maxChunkZ = Math.max(maxChunkZ, coordinate.z);
    chunkCount += 1;
  }

  return {
    version: 1,
    origin: {
      x: 0,
      z: 0,
    },
    chunkSizeMeters: BERLIN_CONE_CHUNK_SIZE_METERS,
    bounds:
      chunkCount === 0
        ? {
            minChunkX: 0,
            maxChunkX: -1,
            minChunkZ: 0,
            maxChunkZ: -1,
          }
        : {
            minChunkX,
            maxChunkX,
            minChunkZ,
            maxChunkZ,
          },
    chunkCount,
  };
}
