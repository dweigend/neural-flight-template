import rawBounds from "./camera-density.berlin.json";
import type {
  BerlinCameraDensitySample,
  BerlinCameraDensitySampler,
  BerlinHeatmapAssetContract,
  BerlinHeatmapBounds,
  BerlinHeatmapImageOrientation,
  BerlinHeatmapRaster,
  BerlinHeatmapUv,
} from "./types";

export const BERLIN_CAMERA_DENSITY_IMAGE_PATH =
  "src/lib/experiences/berlin-flight/heatmaps/camera-density.berlin.png";
export const BERLIN_CAMERA_DENSITY_BOUNDS_PATH =
  "src/lib/experiences/berlin-flight/heatmaps/camera-density.berlin.json";
export const BERLIN_CAMERA_DENSITY_IMAGE_ORIENTATION: BerlinHeatmapImageOrientation =
  "north-up";

export async function loadBerlinCameraDensityAssetContract(): Promise<BerlinHeatmapAssetContract> {
  const imageUrl = await loadBerlinCameraDensityImageUrl();
  return {
    imageOrientation: BERLIN_CAMERA_DENSITY_IMAGE_ORIENTATION,
    imageUrl,
    bounds: parseBerlinHeatmapBounds(rawBounds),
  };
}

export function createBerlinCameraDensitySampler(
  raster: BerlinHeatmapRaster,
): BerlinCameraDensitySampler {
  validateBerlinHeatmapRaster(raster);

  return {
    mode: "asset",
    imageOrientation: raster.imageOrientation,
    bounds: raster.bounds,
    imageWidth: raster.width,
    imageHeight: raster.height,
    sampleDensity(lat: number, lon: number): number {
      return sampleBerlinCameraDensityRaster(raster, lat, lon).density;
    },
    sampleGeoPoint(lat: number, lon: number): BerlinCameraDensitySample {
      return sampleBerlinCameraDensityRaster(raster, lat, lon);
    },
  };
}

export function createBerlinFallbackCameraDensitySampler(
  bounds: BerlinHeatmapBounds,
): BerlinCameraDensitySampler {
  return {
    mode: "fallback-max",
    imageOrientation: BERLIN_CAMERA_DENSITY_IMAGE_ORIENTATION,
    bounds,
    imageWidth: 1,
    imageHeight: 1,
    sampleDensity(): number {
      return 1;
    },
    sampleGeoPoint(lat: number, lon: number): BerlinCameraDensitySample {
      return {
        density: 1,
        uv: mapGeoPointToBerlinHeatmapUv(bounds, lat, lon),
        pixelX: 0,
        pixelY: 0,
      };
    },
  };
}

export function mapGeoPointToBerlinHeatmapUv(
  bounds: BerlinHeatmapBounds,
  lat: number,
  lon: number,
): BerlinHeatmapUv {
  const inBounds = isWithinBounds(bounds, lat, lon);
  const u = clamp01((lon - bounds.west) / (bounds.east - bounds.west));
  const v = clamp01((bounds.north - lat) / (bounds.north - bounds.south));

  return { u, v, inBounds };
}

export function parseBerlinHeatmapBounds(value: unknown): BerlinHeatmapBounds {
  if (!isRecord(value)) {
    throw new Error(
      `${BERLIN_CAMERA_DENSITY_BOUNDS_PATH} must export an object with north/south/west/east numeric bounds.`,
    );
  }

  const north = getFiniteNumber(value, "north");
  const south = getFiniteNumber(value, "south");
  const west = getFiniteNumber(value, "west");
  const east = getFiniteNumber(value, "east");

  if (south >= north) {
    throw new Error(
      `${BERLIN_CAMERA_DENSITY_BOUNDS_PATH} is malformed: south must be smaller than north.`,
    );
  }

  if (west >= east) {
    throw new Error(
      `${BERLIN_CAMERA_DENSITY_BOUNDS_PATH} is malformed: west must be smaller than east.`,
    );
  }

  return { north, south, west, east };
}

function validateBerlinHeatmapRaster(raster: BerlinHeatmapRaster): void {
  if (raster.width < 1 || raster.height < 1) {
    throw new Error("[BerlinFlight] Camera density heatmap must be at least 1x1 pixels.");
  }

  if (raster.rgba.length !== raster.width * raster.height * 4) {
    throw new Error("[BerlinFlight] Camera density heatmap RGBA buffer has an unexpected size.");
  }
}

function isWithinBounds(bounds: BerlinHeatmapBounds, lat: number, lon: number): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lon >= bounds.west &&
    lon <= bounds.east
  );
}

function sampleBerlinCameraDensityRaster(
  raster: BerlinHeatmapRaster,
  lat: number,
  lon: number,
): BerlinCameraDensitySample {
  const uv = mapGeoPointToBerlinHeatmapUv(raster.bounds, lat, lon);
  if (!uv.inBounds) {
    return {
      density: 0,
      uv,
      pixelX: -1,
      pixelY: -1,
    };
  }

  const pixelX = Math.min(raster.width - 1, Math.floor(uv.u * raster.width));
  const pixelY = Math.min(raster.height - 1, Math.floor(uv.v * raster.height));
  const pixelIndex = (pixelY * raster.width + pixelX) * 4;

  return {
    density: getDensityFromRgba(
      raster.rgba[pixelIndex],
      raster.rgba[pixelIndex + 1],
      raster.rgba[pixelIndex + 2],
    ),
    uv,
    pixelX,
    pixelY,
  };
}

function getDensityFromRgba(red: number, green: number, blue: number): number {
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return clamp01(1 - luminance);
}

async function loadBerlinCameraDensityImageUrl(): Promise<string> {
  try {
    const imageModule = await import("./camera-density.berlin.png?url");
    if (typeof imageModule.default !== "string" || imageModule.default.length === 0) {
      throw new Error("empty asset URL");
    }

    return imageModule.default;
  } catch {
    throw new Error(
      `Missing Berlin camera density heatmap PNG at ${BERLIN_CAMERA_DENSITY_IMAGE_PATH}.`,
    );
  }
}

function getFiniteNumber(value: Record<string, unknown>, key: keyof BerlinHeatmapBounds): number {
  const entry = value[key];
  if (typeof entry !== "number" || !Number.isFinite(entry)) {
    throw new Error(
      `${BERLIN_CAMERA_DENSITY_BOUNDS_PATH} is malformed: ${key} must be a finite number.`,
    );
  }

  return entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp01(value: number): number {
  if (value <= Number.EPSILON) {
    return 0;
  }

  if (value >= 1 - Number.EPSILON) {
    return 1;
  }

  return value;
}
