import {
  BERLIN_MITTE_ORIGIN,
  METERS_PER_DEGREE_LAT,
} from "./berlin-mitte-origin";
import type { GeoPoint, WorldPoint } from "./types";

/**
 * Converts geographic coordinates to local world-space meters relative to Berlin Mitte.
 *
 * Convention:
 * - X: East/West (Positive East)
 * - Y: Up/Down (Positive Up)
 * - Z: North/South (Positive South - Three.js default)
 */
export function geoToWorld(point: GeoPoint): WorldPoint {
  const latRad = (BERLIN_MITTE_ORIGIN.lat * Math.PI) / 180;

  // Meters per degree longitude decreases as we move away from the equator
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(latRad);

  const dx = (point.lon - BERLIN_MITTE_ORIGIN.lon) * metersPerDegreeLon;
  const dz = (point.lat - BERLIN_MITTE_ORIGIN.lat) * METERS_PER_DEGREE_LAT;
  const dy = point.height - BERLIN_MITTE_ORIGIN.height;

  return {
    x: dx,
    y: dy,
    z: -dz, // Invert Z for Three.js (Forward is -Z)
  };
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
