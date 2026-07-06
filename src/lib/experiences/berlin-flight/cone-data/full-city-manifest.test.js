// @ts-nocheck
import { expect, test } from "bun:test";
import { createBerlinFullCitySourceManifest } from "./full-city-manifest";

test("createBerlinFullCitySourceManifest emits deterministic full-city sources", () => {
  const manifest = createBerlinFullCitySourceManifest([
    { fileName: "tile-b.json", sourceUrl: "b" },
    { fileName: "tile-a.json", sourceUrl: "a" },
  ]);

  expect(manifest.radiusMeters).toBeUndefined();
  expect(manifest.center).toBeUndefined();
  expect(manifest.sources).toEqual([
    {
      path: "./source-meshes/full-berlin/tile-a.json",
      sourceUrl: "a",
    },
    {
      path: "./source-meshes/full-berlin/tile-b.json",
      sourceUrl: "b",
    },
  ]);
});
