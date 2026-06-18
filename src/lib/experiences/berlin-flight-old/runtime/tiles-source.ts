import { BERLIN_FALLBACK_SOURCE } from "../constants";
import type { TilesRuntimeSource } from "./tiles-runtime";

const ION_ENDPOINT_BASE_URL = "https://api.cesium.com/v1/assets";

export interface BerlinTilesSourceConfig {
  url: string | null;
  assetId: string | null;
  accessToken: string | null;
  attribution: string | null;
}

export function readBerlinTilesSourceConfig(): BerlinTilesSourceConfig {
  const env = import.meta.env;

  return {
    url: readEnvString(env.PUBLIC_BERLIN_TILES_URL),
    assetId: readEnvString(env.PUBLIC_BERLIN_ION_ASSET_ID),
    accessToken: readEnvString(env.PUBLIC_CESIUM_ION_TOKEN),
    attribution: readEnvString(env.PUBLIC_BERLIN_TILES_ATTRIBUTION),
  };
}

export function createBerlinTilesSource(): TilesRuntimeSource | null {
  const config = readBerlinTilesSourceConfig();
  if (config.url) {
    return {
      url: config.url,
      accessToken: config.accessToken ?? undefined,
      attribution: config.attribution ?? undefined,
    };
  }

  if (config.assetId && config.accessToken) {
    return {
      assetId: config.assetId,
      accessToken: config.accessToken,
      attribution: config.attribution ?? undefined,
    };
  }

  // Fallback for development if .env is missing
  console.warn(
    "[BerlinFlight] No tile source found in .env, using fallback source.",
  );
  return {
    assetId: BERLIN_FALLBACK_SOURCE.assetId,
    accessToken: BERLIN_FALLBACK_SOURCE.accessToken,
  };
}

export async function resolveCesiumIonSourceUrl(
  source: TilesRuntimeSource,
  signal: AbortSignal,
): Promise<string | null> {
  if (source.url) return source.url;
  if (!source.assetId) return null;
  if (!source.accessToken) return null;

  const endpointUrl = `https://api.cesium.com/v1/assets/${source.assetId.trim()}/endpoint?access_token=${source.accessToken.trim()}`;
  console.log("[TilesSource] Fetching endpoint:", endpointUrl);

  try {
    const response = await fetch(endpointUrl, { signal });
    if (!response.ok) {
      console.error(
        "[TilesSource] Endpoint fetch failed:",
        response.status,
        response.statusText,
      );
      const body = await response.text();
      console.error("[TilesSource] Response body:", body);
      return null;
    }

    const endpoint: any = await response.json();
    console.log("[TilesSource] Endpoint response:", endpoint);

    let tilesetUrl = readEndpointUrl(endpoint);

    return tilesetUrl;
  } catch (err) {
    console.error("[TilesSource] Network error fetching endpoint:", err);
    return null;
  }
}

function readEndpointUrl(endpoint: unknown): string | null {
  if (!isRecord(endpoint)) return null;

  // Cesium Ion endpoints can return the URL in 'url' or 'options.url'
  if (typeof endpoint.url === "string" && endpoint.url.length > 0) {
    return endpoint.url;
  }

  const options = endpoint.options;
  if (
    isRecord(options) &&
    typeof options.url === "string" &&
    options.url.length > 0
  ) {
    return options.url;
  }

  return null;
}

function readEnvString(value: string | boolean | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
