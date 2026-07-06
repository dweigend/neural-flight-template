// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { createBerlinConePatternTexture } from "./cone-pattern-texture";

test("createBerlinConePatternTexture builds a repeatable runtime texture", () => {
  const texture = createBerlinConePatternTexture();

  expect(texture).toBeInstanceOf(THREE.DataTexture);
  expect(texture.image.width).toBe(8);
  expect(texture.image.height).toBe(8);
  expect(texture.wrapS).toBe(THREE.RepeatWrapping);
  expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  expect(texture.generateMipmaps).toBe(true);
  expect(texture.image.data[0]).not.toBe(texture.image.data[8]);

  texture.dispose();
});
