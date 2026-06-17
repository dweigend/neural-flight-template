import { BERLIN_CESIUM_ION_TOKEN, BERLIN_ION_ASSET_ID } from "../constants";

/**
 * Constructs the Cesium Ion 3D Tileset URL for Berlin.
 */
export function getBerlinTilesetUrl(): string {
	if (!BERLIN_CESIUM_ION_TOKEN || !BERLIN_ION_ASSET_ID) {
		console.warn("[BerlinFlight] Missing Cesium Ion credentials in constants.ts");
		return "";
	}

	// Standard Cesium Ion 3D Tiles endpoint
	return `https://assets.ion.cesium.com/${BERLIN_ION_ASSET_ID}/tileset.json?access_token=${BERLIN_CESIUM_ION_TOKEN}`;
}

/**
 * Helper to check if the source is ready
 */
export function isSourceReady(): boolean {
	return Boolean(BERLIN_CESIUM_ION_TOKEN && BERLIN_ION_ASSET_ID);
}
