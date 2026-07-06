import type { BerlinConeSourceManifest } from "./source-contracts";

export const BERLIN_FULL_CITY_SOURCE_MESH_DIR =
  "src/lib/experiences/berlin-flight/cone-data/source-meshes/full-berlin";
export const BERLIN_FULL_CITY_SOURCE_MANIFEST_PATH =
  "src/lib/experiences/berlin-flight/cone-data/source-manifest.full-berlin.json";
export const BERLIN_FULL_CITY_OUTPUT_DIR =
  "src/lib/experiences/berlin-flight/cone-data/generated";

export function createBerlinFullCitySourceManifest(
  sourceFiles: readonly { fileName: string; sourceUrl?: string }[],
): BerlinConeSourceManifest {
  const sources = sourceFiles
    .slice()
    .sort(compareSourceFiles)
    .map((sourceFile) => ({
      path: `./source-meshes/full-berlin/${sourceFile.fileName}`,
      sourceUrl: sourceFile.sourceUrl,
    }));

  return {
    version: 1,
    outputDir: BERLIN_FULL_CITY_OUTPUT_DIR,
    sources,
  };
}

function compareSourceFiles(
  left: { fileName: string; sourceUrl?: string },
  right: { fileName: string; sourceUrl?: string },
): number {
  if (left.fileName !== right.fileName) {
    return left.fileName.localeCompare(right.fileName);
  }

  return (left.sourceUrl ?? "").localeCompare(right.sourceUrl ?? "");
}
