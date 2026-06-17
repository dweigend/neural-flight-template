import { PUBLIC_CESIUM_ION_TOKEN, PUBLIC_BERLIN_ION_ASSET_ID } from '$env/static/public';

/**
 * Berlin Flight Experience Constants
 */
export const BERLIN_CESIUM_ION_TOKEN = PUBLIC_CESIUM_ION_TOKEN;
export const BERLIN_ION_ASSET_ID = Number(PUBLIC_BERLIN_ION_ASSET_ID);

// Berlin Mitte Center (approximate)
// These will be refined in Phase 2
export const BERLIN_MITTE_COORDINATES = {
	lat: 52.5200,
	lon: 13.4050,
	height: 0
};
