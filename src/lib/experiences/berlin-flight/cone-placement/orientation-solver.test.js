// @ts-nocheck
import { expect, test } from "bun:test";
import * as THREE from "three";
import { BERLIN_CONE_PLACEMENT } from "./config";
import { solveBerlinConeAxisDirection } from "./orientation-solver";

function createPoint() {
  return {
    pointId: "point-a",
    buildingId: "building-a",
    sourceKey: "tile://test:mesh-0",
    cornerIndex: 0,
    elevation: 20,
    worldPosition: new THREE.Vector3(0, 20, 0),
  };
}

test("solveBerlinConeAxisDirection points away from geometry and stays within tilt limits", () => {
  const axis = solveBerlinConeAxisDirection(createPoint(), {
    nearestWorldPoint: new THREE.Vector3(4, 19, 0),
    directionToGeometry: new THREE.Vector3(4, -1, 0),
    horizontalDirectionToGeometry: new THREE.Vector3(4, 0, 0),
    sampleCount: 4,
    contributingMeshCount: 1,
    nearestDistance: Math.sqrt(17),
    farthestDistance: 8,
  });

  expect(axis).not.toBeNull();
  expect(axis.length()).toBeCloseTo(1, 6);
  expect(axis.y).toBeLessThan(0);
  expect(axis.x).toBeLessThan(0);

  const tiltDegrees = THREE.MathUtils.radToDeg(axis.angleTo(new THREE.Vector3(0, -1, 0)));
  expect(tiltDegrees).toBeGreaterThanOrEqual(
    BERLIN_CONE_PLACEMENT.MIN_TILT_DEGREES,
  );
  expect(tiltDegrees).toBeLessThanOrEqual(
    BERLIN_CONE_PLACEMENT.MAX_TILT_DEGREES,
  );
});

test("solveBerlinConeAxisDirection rejects ambiguous mostly vertical neighborhood signals", () => {
  const axis = solveBerlinConeAxisDirection(createPoint(), {
    nearestWorldPoint: new THREE.Vector3(0.1, 10, 0),
    directionToGeometry: new THREE.Vector3(0.1, -10, 0),
    horizontalDirectionToGeometry: new THREE.Vector3(0.1, 0, 0),
    sampleCount: 4,
    contributingMeshCount: 1,
    nearestDistance: Math.sqrt(100.01),
    farthestDistance: 12,
  });

  expect(axis).toBeNull();
});
