import * as THREE from "three";
import type { GeoPoint, WorldPoint } from "./types";

const WGS84_SEMI_MAJOR_AXIS = 6378137.0;
const WGS84_FLATTENING = 1 / 298.257223563;
const WGS84_ECCENTRICITY_SQUARED =
  2 * WGS84_FLATTENING - WGS84_FLATTENING * WGS84_FLATTENING;
const WGS84_SEMI_MINOR_AXIS =
  WGS84_SEMI_MAJOR_AXIS * (1 - WGS84_FLATTENING);
const WGS84_SECOND_ECCENTRICITY_SQUARED =
  (WGS84_SEMI_MAJOR_AXIS * WGS84_SEMI_MAJOR_AXIS -
    WGS84_SEMI_MINOR_AXIS * WGS84_SEMI_MINOR_AXIS) /
  (WGS84_SEMI_MINOR_AXIS * WGS84_SEMI_MINOR_AXIS);

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

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const primeVerticalRadius =
    WGS84_SEMI_MAJOR_AXIS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLat * sinLat);

  return {
    x: (primeVerticalRadius + point.height) * cosLat * cosLon,
    y: (primeVerticalRadius + point.height) * cosLat * sinLon,
    z:
      (primeVerticalRadius * (1 - WGS84_ECCENTRICITY_SQUARED) + point.height) *
      sinLat,
  };
}

export function localToGeo(
  origin: GeoPoint,
  point: WorldPoint,
): GeoPoint {
  const localToECEF = getECEFToLocalMatrix(origin).invert();
  const ecefPoint = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(
    localToECEF,
  );

  return ecefToGeo({
    x: ecefPoint.x,
    y: ecefPoint.y,
    z: ecefPoint.z,
  });
}

export function ecefToGeo(point: WorldPoint): GeoPoint {
  const longitude = Math.atan2(point.y, point.x);
  const horizontalDistance = Math.sqrt(point.x * point.x + point.y * point.y);
  const theta = Math.atan2(
    point.z * WGS84_SEMI_MAJOR_AXIS,
    horizontalDistance * WGS84_SEMI_MINOR_AXIS,
  );
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latitude = Math.atan2(
    point.z +
      WGS84_SECOND_ECCENTRICITY_SQUARED *
        WGS84_SEMI_MINOR_AXIS *
        sinTheta *
        sinTheta *
        sinTheta,
    horizontalDistance -
      WGS84_ECCENTRICITY_SQUARED *
        WGS84_SEMI_MAJOR_AXIS *
        cosTheta *
        cosTheta *
        cosTheta,
  );
  const sinLatitude = Math.sin(latitude);
  const primeVerticalRadius =
    WGS84_SEMI_MAJOR_AXIS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude * sinLatitude);
  const height =
    horizontalDistance / Math.cos(latitude) - primeVerticalRadius;

  return {
    lat: (latitude * 180) / Math.PI,
    lon: (longitude * 180) / Math.PI,
    height,
  };
}

export function geoToLocal(
  origin: GeoPoint,
  point: GeoPoint,
): WorldPoint {
  const ecef = geoToECEF(point);
  const local = new THREE.Vector3(ecef.x, ecef.y, ecef.z).applyMatrix4(
    getECEFToLocalMatrix(origin),
  );

  return {
    x: local.x,
    y: local.y,
    z: local.z,
  };
}
