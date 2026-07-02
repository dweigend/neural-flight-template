import {
  BERLIN_CESIUM_ION_TOKEN,
  BERLIN_ION_ASSET_ID,
  BERLIN_TILES_URL,
} from "../constants";

export interface BerlinTilesSource {
  url: string;
  token: string;
}

type CesiumIonEndpointResponse = {
  accessToken?: unknown;
  options?: {
    url?: unknown;
  };
  url?: unknown;
};

export function isBerlinTilesSourceConfigured(): boolean {
  return Boolean(BERLIN_TILES_URL || (BERLIN_CESIUM_ION_TOKEN && BERLIN_ION_ASSET_ID));
}

export async function resolveBerlinTilesSource(): Promise<BerlinTilesSource> {
  if (BERLIN_TILES_URL) {
    return {
      url: BERLIN_TILES_URL,
      token: BERLIN_CESIUM_ION_TOKEN || "",
    };
  }

  return resolveCesiumIonTilesSource();
}

async function resolveCesiumIonTilesSource(): Promise<BerlinTilesSource> {
  if (!BERLIN_CESIUM_ION_TOKEN || !BERLIN_ION_ASSET_ID) {
    throw new Error(
      "[BerlinFlight] Missing Cesium Ion credentials in public env.",
    );
  }

  const endpoint = `https://api.cesium.com/v1/assets/${BERLIN_ION_ASSET_ID}/endpoint?access_token=${BERLIN_CESIUM_ION_TOKEN}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `[BerlinFlight] Failed to resolve Cesium Ion asset: ${response.status} ${await response.text()}`,
    );
  }

  const data = (await response.json()) as CesiumIonEndpointResponse;

  return {
    url: getCesiumTilesetUrl(data),
    token: getStringValue(data.accessToken),
  };
}

function getCesiumTilesetUrl(data: CesiumIonEndpointResponse): string {
  const tilesetUrl =
    getStringValue(data.url) || getStringValue(data.options?.url);
  if (tilesetUrl) return tilesetUrl;

  throw new Error(
    `[BerlinFlight] Cesium Ion response missing tileset URL. Response: ${JSON.stringify(data)}`,
  );
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
