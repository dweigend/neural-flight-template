// @ts-nocheck
import { expect, test } from "bun:test";
import {
  createBerlinFullCitySourceManifest,
  getBerlinFullCitySourceUrl,
} from "./full-city-manifest";

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

test("getBerlinFullCitySourceUrl requires exactly one sourceUrl per saved tile file", () => {
  expect(
    getBerlinFullCitySourceUrl(
      {
        version: 1,
        meshes: [
          { positions: [0, 0, 0], sourceUrl: "tile-a" },
          { positions: [1, 1, 1], sourceUrl: "tile-a" },
        ],
      },
      "tile-a.json",
    ),
  ).toBe("tile-a");

  expect(() =>
    getBerlinFullCitySourceUrl(
      {
        version: 1,
        meshes: [
          { positions: [0, 0, 0], sourceUrl: "tile-a" },
          { positions: [1, 1, 1], sourceUrl: "tile-b" },
        ],
      },
      "mixed.json",
    ),
  ).toThrow("exactly one tile sourceUrl");
});
