import * as THREE from "three";
import type { GeoPoint, WorldPoint } from "./types";

/**
 * Calculates a Matrix4 that transforms ECEF coordinates to a local ENU-like frame
 * (East, Up, South) centered at the given geographic point.
 */
export function getECEFToLocalMatrix(origin: GeoPoint): THREE.Matrix4 {
  const originECEF = geoToECEF(origin);
  const up = new THREE.Vector3(
    originECEF.x,
    originECEF.y,
    originECEF.z,
  ).normalize();
  const east = new THREE.Vector3(-originECEF.y, originECEF.x, 0).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();

  // Three.js convention: X = East, Y = Up, Z = South (so -Z = North)
  const x = east;
  const y = up;
  const z = new THREE.Vector3().copy(north).negate();

  const matrix = new THREE.Matrix4();
  matrix.set(
    x.x,
    y.x,
    z.x,
    originECEF.x,
    x.y,
    y.y,
    z.y,
    originECEF.y,
    x.z,
    y.z,
    z.z,
    originECEF.z,
    0,
    0,
    0,
    1,
  );

  // We want the inverse: from ECEF to Local
  return matrix.invert();
}

/**
 * Converts geographic coordinates (WGS84) to ECEF (Earth-Centered, Earth-Fixed).
 */
export function geoToECEF(point: GeoPoint): WorldPoint {
  const latRad = (point.lat * Math.PI) / 180;
  const lonRad = (point.lon * Math.PI) / 180;

  const a = 6378137.0; // WGS84 semi-major axis
  const f = 1 / 298.257223563; // WGS84 flattening
  const e2 = 2 * f - f * f; // Square of eccentricity

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  return {
    x: (N + point.height) * cosLat * cosLon,
    y: (N + point.height) * cosLat * sinLon,
    z: (N * (1 - e2) + point.height) * sinLat,
  };
}
