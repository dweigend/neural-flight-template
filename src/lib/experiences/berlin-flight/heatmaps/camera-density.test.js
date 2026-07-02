// @ts-nocheck
import { expect, test } from "bun:test";
import {
  createBerlinCameraDensitySampler,
  mapGeoPointToBerlinHeatmapUv,
  parseBerlinHeatmapBounds,
} from "./camera-density";

test("parseBerlinHeatmapBounds accepts Berlin bounds and rejects inverted latitude bounds", () => {
  expect(
    parseBerlinHeatmapBounds({
      north: 52.675,
      south: 52.338,
      west: 13.088,
      east: 13.761,
    }),
  ).toEqual({
    north: 52.675,
    south: 52.338,
    west: 13.088,
    east: 13.761,
  });

  expect(() =>
    parseBerlinHeatmapBounds({
      north: 52.338,
      south: 52.675,
      west: 13.088,
      east: 13.761,
    }),
  ).toThrow("south must be smaller than north");
});

test("createBerlinCameraDensitySampler returns inverted luminance density and zero outside bounds", () => {
  const sampler = createBerlinCameraDensitySampler({
    imageOrientation: "north-up",
    bounds: {
      north: 52.675,
      south: 52.338,
      west: 13.088,
      east: 13.761,
    },
    width: 2,
    height: 1,
    rgba: new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
    ]),
  });

  expect(sampler.sampleDensity(52.5, 13.1)).toBe(1);
  expect(sampler.sampleDensity(52.5, 13.7)).toBe(0);
  expect(sampler.sampleDensity(60, 13.1)).toBe(0);
});

test("mapGeoPointToBerlinHeatmapUv uses north-up linear bounds mapping", () => {
  expect(
    mapGeoPointToBerlinHeatmapUv(
      {
        north: 52.675,
        south: 52.338,
        west: 13.088,
        east: 13.761,
      },
      52.675,
      13.088,
    ),
  ).toEqual({
    u: 0,
    v: 0,
    inBounds: true,
  });

  expect(
    mapGeoPointToBerlinHeatmapUv(
      {
        north: 52.675,
        south: 52.338,
        west: 13.088,
        east: 13.761,
      },
      52.338,
      13.761,
    ),
  ).toEqual({
    u: 1,
    v: 1,
    inBounds: true,
  });
});
