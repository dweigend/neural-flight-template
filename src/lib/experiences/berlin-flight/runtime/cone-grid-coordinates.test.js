// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import {
  BERLIN_CONE_CHUNK_SIZE_METERS,
  collectConeChunkKeys,
  getConeChunkCoordinate,
  getConeChunkKey,
  parseConeChunkKey,
} from "./cone-grid-coordinates";

test("cone chunk coordinates stay aligned to Berlin local world chunks", () => {
  const position = new THREE.Vector3(
    BERLIN_CONE_CHUNK_SIZE_METERS + 10,
    0,
    -BERLIN_CONE_CHUNK_SIZE_METERS - 10,
  );

  const coordinate = getConeChunkCoordinate(position);

  expect(coordinate).toEqual({ x: 1, z: -2 });
  expect(getConeChunkKey(coordinate)).toBe("1:-2");
  expect(parseConeChunkKey("1:-2")).toEqual(coordinate);
});

test("cone chunk collection returns stable x:z keys around a center chunk", () => {
  expect(collectConeChunkKeys({ x: 0, z: 0 }, 1)).toEqual([
    "-1:-1",
    "0:-1",
    "1:-1",
    "-1:0",
    "0:0",
    "1:0",
    "-1:1",
    "0:1",
    "1:1",
  ]);
});
