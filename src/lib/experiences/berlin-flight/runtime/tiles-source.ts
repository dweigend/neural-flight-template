import {
  BERLIN_CESIUM_ION_TOKEN,
  BERLIN_ION_ASSET_ID,
  BERLIN_TILES_URL,
} from "../constants";

/**
 * Resolves the Cesium Ion asset endpoint to get the actual tileset URL and access token.
 * If a direct BERLIN_TILES_URL is provided, it uses that instead.
 */
export async function resolveBerlinTileset(): Promise<{
  url: string;
  token: string;
}> {
  // If we have a direct URL, use it
  if (BERLIN_TILES_URL) {
    return {
      url: BERLIN_TILES_URL,
      token: BERLIN_CESIUM_ION_TOKEN || "",
    };
  }

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

  // Handle both direct URLs and nested options (common for Google Photorealistic Tiles)
  const tilesetUrl = data.url || data.options?.url;

  if (!tilesetUrl) {
    const responseString = JSON.stringify(data);
    throw new Error(
      `[BerlinFlight] Cesium Ion response missing tileset URL. Response: ${responseString}. Check if the Asset ID ${BERLIN_ION_ASSET_ID} is a valid 3D Tileset and your token has access.`,
    );
  }

  return {
    url: tilesetUrl,
    token: data.accessToken || "",
  };
}

/**
 * Helper to check if the source is configured
 */
export function isSourceConfigured(): boolean {
  return Boolean(
    BERLIN_TILES_URL || (BERLIN_CESIUM_ION_TOKEN && BERLIN_ION_ASSET_ID),
  );
}
