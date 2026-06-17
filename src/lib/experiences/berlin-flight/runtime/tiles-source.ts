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
	if (!config.assetId) return null;
	if (!config.accessToken) return null;

	return {
		assetId: config.assetId,
		accessToken: config.accessToken,
		attribution: config.attribution ?? undefined,
	};
}

export async function resolveCesiumIonSourceUrl(
	source: TilesRuntimeSource,
	signal: AbortSignal,
): Promise<string | null> {
	if (source.url) return source.url;
	if (!source.assetId) return null;
	if (!source.accessToken) return null;

	const endpointUrl = `${ION_ENDPOINT_BASE_URL}/${encodeURIComponent(source.assetId)}/endpoint?access_token=${encodeURIComponent(source.accessToken)}`;
	const response = await fetch(endpointUrl, { signal });
	if (!response.ok) return null;

	const endpoint: unknown = await response.json();
	return readEndpointUrl(endpoint);
}

function readEndpointUrl(endpoint: unknown): string | null {
	if (!isRecord(endpoint)) return null;
	const url = endpoint.url;
	return typeof url === "string" && url.length > 0 ? url : null;
}

function readEnvString(value: string | boolean | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
