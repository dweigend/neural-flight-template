import {
  PUBLIC_CESIUM_ION_TOKEN,
  PUBLIC_BERLIN_ION_ASSET_ID,
  PUBLIC_BERLIN_TILES_URL,
} from "$env/static/public";

/**
 * Berlin Flight Experience Constants
 */
export const BERLIN_CESIUM_ION_TOKEN = PUBLIC_CESIUM_ION_TOKEN;
export const BERLIN_ION_ASSET_ID = Number(PUBLIC_BERLIN_ION_ASSET_ID);
export const BERLIN_TILES_URL = PUBLIC_BERLIN_TILES_URL;

// Berlin Mitte Center (approximate)
// These will be refined in Phase 2
export const BERLIN_MITTE_COORDINATES = {
  lat: 52.52,
  lon: 13.405,
  height: 0,
};
