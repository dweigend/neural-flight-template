import { BERLIN_MITTE_ORIGIN, METERS_PER_DEGREE_LAT } from "./berlin-mitte-origin";
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
 * Converts local world-space meters back to geographic coordinates.
 */
export function worldToGeo(point: WorldPoint): GeoPoint {
	const latRad = (BERLIN_MITTE_ORIGIN.lat * Math.PI) / 180;
	const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(latRad);

	const lon = BERLIN_MITTE_ORIGIN.lon + point.x / metersPerDegreeLon;
	const lat = BERLIN_MITTE_ORIGIN.lat + (-point.z) / METERS_PER_DEGREE_LAT;
	const height = BERLIN_MITTE_ORIGIN.height + point.y;

	return { lat, lon, height };
}
