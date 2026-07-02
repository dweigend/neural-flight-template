import { json } from "@sveltejs/kit";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type ConeSourceCaptureRequest = {
  center?: {
    x?: unknown;
    z?: unknown;
  };
  radiusMeters?: unknown;
  sourceFile?: {
    version?: unknown;
    meshes?: unknown;
  };
};

export async function POST({ request }) {
  const body = (await request.json()) as ConeSourceCaptureRequest;
  const center = parseCenter(body.center);
  const radiusMeters = parseRadiusMeters(body.radiusMeters);
  const sourceFile = parseSourceFile(body.sourceFile);

  const coneDataDir = path.resolve(
    process.cwd(),
    "src/lib/experiences/berlin-flight/cone-data",
  );
  const sourceMeshesDir = path.join(coneDataDir, "source-meshes");
  const sourceMeshPath = path.join(sourceMeshesDir, "center-1km.json");
  const sourceManifestPath = path.join(coneDataDir, "source-manifest.json");

  await mkdir(sourceMeshesDir, { recursive: true });
  await writeFile(sourceMeshPath, JSON.stringify(sourceFile, null, 2));
  await writeFile(
    sourceManifestPath,
    JSON.stringify(
      {
        version: 1,
        center,
        radiusMeters,
        outputDir: "src/lib/experiences/berlin-flight/cone-data/generated",
        sources: [
          {
            path: "./source-meshes/center-1km.json",
            sourceUrl: "cesium-center-1km",
          },
        ],
      },
      null,
      2,
    ),
  );

  return json({
    center,
    radiusMeters,
    savedMeshes: sourceFile.meshes.length,
    sourceManifestPath,
    sourceMeshPath,
  });
}

function parseCenter(value: ConeSourceCaptureRequest["center"]): {
  x: number;
  z: number;
} {
  if (
    !value ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.z !== "number" ||
    !Number.isFinite(value.z)
  ) {
    throw new Error("[BerlinFlight] Invalid center for cone source capture.");
  }

  return {
    x: value.x,
    z: value.z,
  };
}

function parseRadiusMeters(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("[BerlinFlight] Invalid radiusMeters for cone source capture.");
  }

  return value;
}

function parseSourceFile(value: ConeSourceCaptureRequest["sourceFile"]): {
  version: 1;
  meshes: Array<{
    positions: number[];
    matrixWorld?: number[];
    sourceUrl?: string;
  }>;
} {
  if (!value || value.version !== 1 || !Array.isArray(value.meshes)) {
    throw new Error("[BerlinFlight] Invalid sourceFile for cone source capture.");
  }

  return {
    version: 1,
    meshes: value.meshes.map((mesh, index) => {
      if (
        !mesh ||
        typeof mesh !== "object" ||
        !Array.isArray(mesh.positions)
      ) {
        throw new Error(
          `[BerlinFlight] Invalid mesh ${index} in cone source capture payload.`,
        );
      }

      const matrixWorld =
        Array.isArray(mesh.matrixWorld) &&
        mesh.matrixWorld.every((entry: unknown) => typeof entry === "number")
          ? mesh.matrixWorld
          : undefined;

      return {
        positions: mesh.positions.map((entry: unknown, positionIndex: number) =>
          parseNumber(entry, `mesh ${index} positions[${positionIndex}]`),
        ),
        matrixWorld: matrixWorld?.map((entry: unknown, matrixIndex: number) =>
          parseNumber(entry, `mesh ${index} matrixWorld[${matrixIndex}]`),
        ),
        sourceUrl:
          typeof mesh.sourceUrl === "string" ? mesh.sourceUrl : undefined,
      };
    }),
  };
}

function parseNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[BerlinFlight] Invalid number for ${label}.`);
  }

  return value;
}
