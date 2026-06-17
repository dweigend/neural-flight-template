import { BERLIN_CESIUM_ION_TOKEN, BERLIN_ION_ASSET_ID } from "../constants";

/**
 * Resolves the Cesium Ion asset endpoint to get the actual tileset URL and access token.
 */
export async function resolveBerlinTileset(): Promise<{
  url: string;
  token: string;
}> {
  if (!BERLIN_CESIUM_ION_TOKEN || !BERLIN_ION_ASSET_ID) {
    throw new Error(
      "[BerlinFlight] Missing Cesium Ion credentials in constants.ts",
    );
  }

  const endpoint = `https://api.cesium.com/v1/assets/${BERLIN_ION_ASSET_ID}/endpoint?access_token=${BERLIN_CESIUM_ION_TOKEN}`;

  const response = await fetch(endpoint);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[BerlinFlight] Failed to resolve Cesium Ion asset: ${response.status} ${errorText}`,
    );
  }

  const data = await response.json();
  if (!data.url) {
    throw new Error("[BerlinFlight] Cesium Ion response missing tileset URL");
  }

  return {
    url: data.url,
    token: data.accessToken,
  };
}

/**
 * Helper to check if the source is configured
 */
export function isSourceConfigured(): boolean {
  return Boolean(BERLIN_CESIUM_ION_TOKEN && BERLIN_ION_ASSET_ID);
}
