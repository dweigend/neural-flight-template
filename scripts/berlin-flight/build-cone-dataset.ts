import path from "node:path";
import sharp from "sharp";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  buildBerlinConeDataset,
  createTrackedMeshFromOfflineGeometry,
} from "../../src/lib/experiences/berlin-flight/cone-data/build";
import type {
  BerlinConeSourceManifest,
  BerlinConeSourceMeshFile,
} from "../../src/lib/experiences/berlin-flight/cone-data/source-contracts";
import {
  BERLIN_CAMERA_DENSITY_BOUNDS_PATH,
  BERLIN_CAMERA_DENSITY_IMAGE_PATH,
  createBerlinCameraDensitySampler,
  parseBerlinHeatmapBounds,
} from "../../src/lib/experiences/berlin-flight/heatmaps/camera-density";

const DEFAULT_SOURCE_MANIFEST =
  "src/lib/experiences/berlin-flight/cone-data/source-manifest.json";
const DEFAULT_OUTPUT_DIR =
  "src/lib/experiences/berlin-flight/cone-data/generated";

async function main(): Promise<void> {
  const sourceManifestPath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE_MANIFEST);
  const sourceManifest = parseSourceManifest(
    JSON.parse(await readTextFile(sourceManifestPath, "cone source manifest")),
    sourceManifestPath,
  );
  if (sourceManifest.sources.length === 0) {
    throw new Error(
      `[BerlinFlight] Cone source manifest has no sources: ${sourceManifestPath}`,
    );
  }

  const densitySampler = await loadDensitySampler(
    sourceManifest.heatmapImagePath ?? BERLIN_CAMERA_DENSITY_IMAGE_PATH,
    sourceManifest.heatmapBoundsPath ?? BERLIN_CAMERA_DENSITY_BOUNDS_PATH,
  );
  const trackedMeshes = [];

  for (const source of sourceManifest.sources) {
    const sourcePath = path.resolve(path.dirname(sourceManifestPath), source.path);
    const sourceFile = parseSourceMeshFile(
      JSON.parse(await readTextFile(sourcePath, "cone source mesh file")),
      sourcePath,
    );

    for (const [index, mesh] of sourceFile.meshes.entries()) {
      trackedMeshes.push(
        createTrackedMeshFromOfflineGeometry({
          positions: mesh.positions,
          matrixWorld: mesh.matrixWorld,
          sourceUrl:
            mesh.sourceUrl ??
            source.sourceUrl ??
            `${path.basename(sourcePath)}#${index}`,
        }),
      );
    }
  }

  if (trackedMeshes.length === 0) {
    throw new Error(
      `[BerlinFlight] No offline meshes were loaded from ${sourceManifestPath}`,
    );
  }

  const outputDir = path.resolve(sourceManifest.outputDir ?? DEFAULT_OUTPUT_DIR);
  const chunksDir = path.join(outputDir, "chunks");
  const result = buildBerlinConeDataset({
    trackedMeshes,
    densitySampler,
  });

  await rm(outputDir, { force: true, recursive: true });
  await mkdir(chunksDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(result.manifest, null, 2),
  );

  for (const chunk of result.chunks.values()) {
    await writeFile(
      path.join(chunksDir, `${chunk.chunkKey}.json`),
      JSON.stringify(
        {
          chunkKey: chunk.chunkKey,
          chunkWorldMinX: chunk.chunkWorldMinX,
          chunkWorldMinZ: chunk.chunkWorldMinZ,
          chunkSizeMeters: chunk.chunkSizeMeters,
          positions: Array.from(chunk.positions),
          scalars: Array.from(chunk.scalars),
          coneIndex: Array.from(chunk.coneIndex),
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        outputDir,
        chunkCount: result.manifest.chunkCount,
        ...result.stats,
      },
      null,
      2,
    ),
  );
}

async function loadDensitySampler(imagePath: string, boundsPath: string) {
  const image = sharp(path.resolve(imagePath));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const bounds = parseBerlinHeatmapBounds(
    JSON.parse(await readTextFile(path.resolve(boundsPath), "heatmap bounds")),
  );

  return createBerlinCameraDensitySampler({
    width: info.width,
    height: info.height,
    rgba: new Uint8ClampedArray(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ),
    bounds,
    imageOrientation: "north-up",
  });
}

function parseSourceManifest(
  value: unknown,
  filePath: string,
): BerlinConeSourceManifest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sources)) {
    throw new Error(
      `[BerlinFlight] Invalid cone source manifest at ${filePath}. Expected { version: 1, sources: [...] }.`,
    );
  }

  return {
    version: 1,
    sources: value.sources.map((source, index) => {
      if (!isRecord(source) || typeof source.path !== "string") {
        throw new Error(
          `[BerlinFlight] Invalid source entry ${index} in ${filePath}. Expected { path: string }.`,
        );
      }

      return {
        path: source.path,
        sourceUrl:
          typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
      };
    }),
    outputDir: typeof value.outputDir === "string" ? value.outputDir : undefined,
    heatmapImagePath:
      typeof value.heatmapImagePath === "string"
        ? value.heatmapImagePath
        : undefined,
    heatmapBoundsPath:
      typeof value.heatmapBoundsPath === "string"
        ? value.heatmapBoundsPath
        : undefined,
  };
}

function parseSourceMeshFile(
  value: unknown,
  filePath: string,
): BerlinConeSourceMeshFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.meshes)) {
    throw new Error(
      `[BerlinFlight] Invalid cone source mesh file at ${filePath}. Expected { version: 1, meshes: [...] }.`,
    );
  }

  return {
    version: 1,
    meshes: value.meshes.map((mesh, index) => {
      if (!isRecord(mesh) || !Array.isArray(mesh.positions)) {
        throw new Error(
          `[BerlinFlight] Invalid mesh ${index} in ${filePath}. Expected numeric positions.`,
        );
      }

      return {
        positions: mesh.positions.map((entry, positionIndex) =>
          getFiniteNumber(entry, `${filePath} mesh ${index} positions[${positionIndex}]`),
        ),
        matrixWorld: Array.isArray(mesh.matrixWorld)
          ? mesh.matrixWorld.map((entry, matrixIndex) =>
              getFiniteNumber(
                entry,
                `${filePath} mesh ${index} matrixWorld[${matrixIndex}]`,
              ),
            )
          : undefined,
        sourceUrl:
          typeof mesh.sourceUrl === "string" ? mesh.sourceUrl : undefined,
      };
    }),
  };
}

function getFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[BerlinFlight] Expected finite number for ${label}.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readTextFile(filePath: string, label: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `[BerlinFlight] Missing ${label} at ${filePath}. Point the builder at a local source manifest or create one from source-manifest.example.json.`,
      { cause: error },
    );
  }
}

void main();
