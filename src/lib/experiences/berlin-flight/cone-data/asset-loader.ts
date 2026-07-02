import * as THREE from "three";
import type { BerlinConeChunkSnapshot, BerlinConeVolume } from "../collision/types";
import type { BerlinConeChunkKey } from "../runtime/cone-grid-coordinates";
import type {
  BerlinConeChunkData,
  BerlinConeDatasetManifest,
} from "./contracts";

export interface BerlinConeDatasetAssetLoader {
  loadChunk(chunkKey: string): Promise<BerlinConeChunkSnapshot>;
  loadManifest(): Promise<BerlinConeDatasetManifest>;
}

type ImportGlobModuleLoader = () => Promise<unknown>;
type ImportGlob = (
  pattern: string,
  options: { import: "default" },
) => Record<string, ImportGlobModuleLoader>;

const manifestModules = getImportGlob()?.("./generated/manifest.json", {
  import: "default",
}) ?? {};
const chunkModules = getImportGlob()?.("./generated/chunks/*.json", {
  import: "default",
}) ?? {};

export function createBerlinConeDatasetAssetLoader(): BerlinConeDatasetAssetLoader {
  return {
    async loadManifest(): Promise<BerlinConeDatasetManifest> {
      const manifestModule = Object.values(manifestModules)[0];
      if (!manifestModule) {
        throw new Error(
          "[BerlinFlight] Missing precomputed cone manifest at cone-data/generated/manifest.json. Build the dataset first.",
        );
      }

      return parseBerlinConeDatasetManifest(await manifestModule());
    },
    async loadChunk(chunkKey: string): Promise<BerlinConeChunkSnapshot> {
      const chunkModule = chunkModules[`./generated/chunks/${chunkKey}.json`];
      if (!chunkModule) {
        throw new Error(
          `[BerlinFlight] Missing precomputed cone chunk ${chunkKey} at cone-data/generated/chunks/${chunkKey}.json.`,
        );
      }

      return createBerlinConeChunkSnapshot(parseBerlinConeChunkData(await chunkModule()));
    },
  };
}

export function parseBerlinConeDatasetManifest(
  value: unknown,
): BerlinConeDatasetManifest {
  if (!isRecord(value) || !isRecord(value.origin) || !isRecord(value.bounds)) {
    throw new Error("[BerlinFlight] Malformed cone dataset manifest.");
  }

  return {
    version: getFiniteNumber(value.version, "manifest.version"),
    origin: {
      x: getFiniteNumber(value.origin.x, "manifest.origin.x"),
      z: getFiniteNumber(value.origin.z, "manifest.origin.z"),
    },
    chunkSizeMeters: getFiniteNumber(
      value.chunkSizeMeters,
      "manifest.chunkSizeMeters",
    ),
    bounds: {
      minChunkX: getFiniteNumber(value.bounds.minChunkX, "manifest.bounds.minChunkX"),
      maxChunkX: getFiniteNumber(value.bounds.maxChunkX, "manifest.bounds.maxChunkX"),
      minChunkZ: getFiniteNumber(value.bounds.minChunkZ, "manifest.bounds.minChunkZ"),
      maxChunkZ: getFiniteNumber(value.bounds.maxChunkZ, "manifest.bounds.maxChunkZ"),
    },
    chunkCount: getFiniteNumber(value.chunkCount, "manifest.chunkCount"),
  };
}

export function parseBerlinConeChunkData(value: unknown): BerlinConeChunkData {
  if (!isRecord(value) || typeof value.chunkKey !== "string") {
    throw new Error("[BerlinFlight] Malformed cone chunk payload.");
  }

  const positions = getFiniteNumberArray(value.positions, "chunk.positions");
  const scalars = getFiniteNumberArray(value.scalars, "chunk.scalars");
  const coneIndex = getFiniteIntegerArray(value.coneIndex, "chunk.coneIndex");

  if (positions.length % 6 !== 0) {
    throw new Error(
      `[BerlinFlight] Cone chunk ${value.chunkKey} has invalid positions length ${positions.length}. Expected multiples of 6.`,
    );
  }

  if (scalars.length % 2 !== 0) {
    throw new Error(
      `[BerlinFlight] Cone chunk ${value.chunkKey} has invalid scalars length ${scalars.length}. Expected multiples of 2.`,
    );
  }

  if (positions.length / 6 !== scalars.length / 2 || positions.length / 6 !== coneIndex.length) {
    throw new Error(
      `[BerlinFlight] Cone chunk ${value.chunkKey} has mismatched array lengths.`,
    );
  }

  return {
    chunkKey: parseBerlinConeChunkKey(value.chunkKey),
    chunkWorldMinX: getFiniteNumber(value.chunkWorldMinX, "chunk.chunkWorldMinX"),
    chunkWorldMinZ: getFiniteNumber(value.chunkWorldMinZ, "chunk.chunkWorldMinZ"),
    chunkSizeMeters: getFiniteNumber(value.chunkSizeMeters, "chunk.chunkSizeMeters"),
    positions: Float32Array.from(positions),
    scalars: Float32Array.from(scalars),
    coneIndex: Int32Array.from(coneIndex),
  };
}

export function createBerlinConeChunkSnapshot(
  chunk: BerlinConeChunkData,
): BerlinConeChunkSnapshot {
  const cones: BerlinConeVolume[] = [];

  for (let index = 0; index < chunk.coneIndex.length; index += 1) {
    const positionOffset = index * 6;
    const scalarOffset = index * 2;
    const tip = new THREE.Vector3(
      chunk.positions[positionOffset],
      chunk.positions[positionOffset + 1],
      chunk.positions[positionOffset + 2],
    );
    const axisDirection = new THREE.Vector3(
      chunk.positions[positionOffset + 3],
      chunk.positions[positionOffset + 4],
      chunk.positions[positionOffset + 5],
    );
    const radius = chunk.scalars[scalarOffset];
    const height = chunk.scalars[scalarOffset + 1];

    cones.push({
      tip,
      axisDirection,
      radius,
      height,
      baseCenter: tip.clone().addScaledVector(axisDirection, height),
      placementPointId: `${chunk.chunkKey}:${chunk.coneIndex[index]}`,
      sourceBuildingId: chunk.chunkKey,
      chunkKey: chunk.chunkKey,
      coneIndex: chunk.coneIndex[index],
    });
  }

  return {
    key: chunk.chunkKey,
    cones,
  };
}

function getFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[BerlinFlight] Expected finite number for ${label}.`);
  }

  return value;
}

function getFiniteNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`[BerlinFlight] Expected numeric array for ${label}.`);
  }

  return value.map((entry, index) =>
    getFiniteNumber(entry, `${label}[${index}]`),
  );
}

function getFiniteIntegerArray(value: unknown, label: string): number[] {
  return getFiniteNumberArray(value, label).map((entry, index) => {
    if (!Number.isInteger(entry)) {
      throw new Error(`[BerlinFlight] Expected integer for ${label}[${index}].`);
    }

    return entry;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBerlinConeChunkKey(value: string): BerlinConeChunkKey {
  if (!/^-?\d+:-?\d+$/.test(value)) {
    throw new Error(`[BerlinFlight] Invalid cone chunk key "${value}".`);
  }

  return value as BerlinConeChunkKey;
}

function getImportGlob(): ImportGlob | null {
  const meta = import.meta as ImportMeta & {
    glob?: ImportGlob;
  };
  return typeof meta.glob === "function" ? meta.glob : null;
}
