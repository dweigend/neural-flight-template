/**
 * Geographic coordinates (WGS84)
 */
export interface GeoPoint {
	lat: number;
	lon: number;
	height: number;
}

/**
 * Local world-space coordinates (Three.js meters)
 */
export interface WorldPoint {
	x: number;
	y: number;
	z: number;
}
