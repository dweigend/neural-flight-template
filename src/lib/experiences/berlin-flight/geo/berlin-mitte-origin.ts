import type { GeoPoint } from "./types";

/**
 * The reference origin for Berlin Mitte.
 * All local world-space coordinates (0,0,0) are relative to this point.
 *
 * Location: Alexanderplatz / Fernsehturm area
 */
export const BERLIN_MITTE_ORIGIN: GeoPoint = {
	lat: 52.5200,
	lon: 13.4050,
	height: 0,
};

/**
 * Conversion constants
 */
export const EARTH_RADIUS = 6378137; // WGS84 semi-major axis in meters
export const METERS_PER_DEGREE_LAT = 111319.9; // Approximate at equator
