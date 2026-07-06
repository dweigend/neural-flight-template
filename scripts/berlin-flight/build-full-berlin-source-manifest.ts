import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH,
  BERLIN_FULL_CITY_SOURCE_MESH_DIR,
  createBerlinFullCitySourceManifest,
  getBerlinFullCitySourceUrl,
} from "../../src/lib/experiences/berlin-flight/cone-data/full-city-manifest";
import type { BerlinConeSourceMeshFile } from "../../src/lib/experiences/berlin-flight/cone-data/source-contracts";

async function main(): Promise<void> {
  const sourceDir = path.resolve(process.cwd(), BERLIN_FULL_CITY_SOURCE_MESH_DIR);
  const manifestPath = path.resolve(
    process.cwd(),
    BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH,
  );

  let fileNames: string[];
  try {
    fileNames = (await readdir(sourceDir))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    throw new Error(
      `[BerlinFlight] Missing full-Berlin source mesh directory at ${sourceDir}. Run the full-city exporter first.`,
      { cause: error },
    );
  }

  if (fileNames.length === 0) {
    throw new Error(
      `[BerlinFlight] No full-Berlin source mesh files found in ${sourceDir}. Run the full-city exporter first.`,
    );
  }

  const manifest = createBerlinFullCitySourceManifest(
    await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = path.join(sourceDir, fileName);
        const sourceFile = parseSourceMeshFile(
          JSON.parse(await readFile(filePath, "utf8")),
          filePath,
        );

        return {
          fileName,
          sourceUrl: getBerlinFullCitySourceUrl(sourceFile, filePath),
        };
      }),
    ),
  );
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        manifestPath,
        rebuildCommand:
          "bun run berlin:cone-dataset",
        sourceCount: manifest.sources.length,
      },
      null,
      2,
    ),
  );
}

function parseSourceMeshFile(
  value: unknown,
  filePath: string,
): BerlinConeSourceMeshFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.meshes)) {
    throw new Error(
      `[BerlinFlight] Invalid full-Berlin source mesh file at ${filePath}. Expected { version: 1, meshes: [...] }.`,
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
          getFiniteNumber(
            entry,
            `${filePath} mesh ${index} positions[${positionIndex}]`,
          ),
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

void main();
