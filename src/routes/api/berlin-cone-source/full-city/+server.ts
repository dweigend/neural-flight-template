import { json } from "@sveltejs/kit";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BERLIN_FULL_CITY_OUTPUT_DIR,
  BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH,
  BERLIN_FULL_CITY_SOURCE_MESH_DIR,
  createBerlinFullCitySourceManifest,
} from "$lib/experiences/berlin-flight/cone-data/full-city-manifest";

type FullCityConeSourceExportRequest = {
  outputDir?: unknown;
  sourceTiles?: unknown;
};

type ParsedSourceTile = {
  sourceUrl: string;
  file: {
    version: 1;
    meshes: Array<{
      positions: number[];
      matrixWorld?: number[];
      sourceUrl?: string;
    }>;
  };
};

export async function POST({ request }) {
  const body = (await request.json()) as FullCityConeSourceExportRequest;
  const sourceTiles = parseSourceTiles(body.sourceTiles);
  if (sourceTiles.length === 0) {
    throw new Error("[BerlinFlight] Full-city cone source export received no source tiles.");
  }

  const outputDir =
    typeof body.outputDir === "string" && body.outputDir.length > 0
      ? body.outputDir
      : BERLIN_FULL_CITY_OUTPUT_DIR;
  const sourceDir = path.resolve(process.cwd(), BERLIN_FULL_CITY_SOURCE_MESH_DIR);
  const manifestPath = path.resolve(
    process.cwd(),
    BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH,
  );

  await rm(sourceDir, { force: true, recursive: true });
  await mkdir(sourceDir, { recursive: true });

  const sourceFiles = [];
  let meshCount = 0;

  for (const sourceTile of sourceTiles.sort(compareSourceTiles)) {
    const fileName = createSourceFileName(sourceTile.sourceUrl);
    const absoluteFilePath = path.join(sourceDir, fileName);

    await writeFile(absoluteFilePath, JSON.stringify(sourceTile.file, null, 2));
    sourceFiles.push({
      fileName,
      sourceUrl: sourceTile.sourceUrl,
    });
    meshCount += sourceTile.file.meshes.length;
  }

  const manifest = createBerlinFullCitySourceManifest(sourceFiles);

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        outputDir,
        ...manifest,
      },
      null,
      2,
    ),
  );

  return json({
    manifestPath,
    outputDir,
    savedSourceFiles: manifest.sources.length,
    savedMeshes: meshCount,
    sourceDir,
  });
}

function parseSourceTiles(value: unknown): ParsedSourceTile[] {
  if (!Array.isArray(value)) {
    throw new Error("[BerlinFlight] Invalid full-city cone source export payload.");
  }

  return value.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.sourceUrl !== "string" ||
      entry.sourceUrl.length === 0
    ) {
      throw new Error(
        `[BerlinFlight] Invalid source tile ${index} in full-city export payload.`,
      );
    }

    return {
      sourceUrl: entry.sourceUrl,
      file: parseSourceFile(entry.file, index),
    };
  });
}

function parseSourceFile(value: unknown, sourceIndex: number): ParsedSourceTile["file"] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.meshes)) {
    throw new Error(
      `[BerlinFlight] Invalid source file for tile ${sourceIndex} in full-city export payload.`,
    );
  }

  return {
    version: 1,
    meshes: value.meshes.map((mesh, meshIndex) => {
      if (!isRecord(mesh) || !Array.isArray(mesh.positions)) {
        throw new Error(
          `[BerlinFlight] Invalid mesh ${meshIndex} for tile ${sourceIndex} in full-city export payload.`,
        );
      }

      const matrixWorld = Array.isArray(mesh.matrixWorld)
        ? mesh.matrixWorld.map((entry, matrixIndex) =>
            parseNumber(
              entry,
              `tile ${sourceIndex} mesh ${meshIndex} matrixWorld[${matrixIndex}]`,
            ),
          )
        : undefined;

      return {
        positions: mesh.positions.map((entry, positionIndex) =>
          parseNumber(
            entry,
            `tile ${sourceIndex} mesh ${meshIndex} positions[${positionIndex}]`,
          ),
        ),
        matrixWorld,
        sourceUrl:
          typeof mesh.sourceUrl === "string" ? mesh.sourceUrl : undefined,
      };
    }),
  };
}

function createSourceFileName(sourceUrl: string): string {
  const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12);
  const slug = sourceUrl
    .split("/")
    .at(-1)
    ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${slug && slug.length > 0 ? slug : "tile"}-${hash}.json`;
}

function compareSourceTiles(left: ParsedSourceTile, right: ParsedSourceTile): number {
  return left.sourceUrl.localeCompare(right.sourceUrl);
}

function parseNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[BerlinFlight] Invalid number for ${label}.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
