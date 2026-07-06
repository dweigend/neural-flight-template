import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH,
  BERLIN_FULL_CITY_SOURCE_MESH_DIR,
  createBerlinFullCitySourceManifest,
} from "../../src/lib/experiences/berlin-flight/cone-data/full-city-manifest";

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
    fileNames.map((fileName) => ({ fileName })),
  );
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        manifestPath,
        sourceCount: manifest.sources.length,
      },
      null,
      2,
    ),
  );
}

void main();
