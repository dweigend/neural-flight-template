export type BerlinHeatmapImageOrientation = "north-up";

export interface BerlinHeatmapBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface BerlinHeatmapAssetContract {
  imageOrientation: BerlinHeatmapImageOrientation;
  imageUrl: string;
  bounds: BerlinHeatmapBounds;
}

export interface BerlinHeatmapRaster {
  imageOrientation: BerlinHeatmapImageOrientation;
  bounds: BerlinHeatmapBounds;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface BerlinCameraDensitySampler {
  mode: "asset" | "fallback-max";
  imageOrientation: BerlinHeatmapImageOrientation;
  bounds: BerlinHeatmapBounds;
  imageWidth: number;
  imageHeight: number;
  sampleDensity(lat: number, lon: number): number;
  sampleGeoPoint(lat: number, lon: number): BerlinCameraDensitySample;
}

export interface BerlinHeatmapUv {
  u: number;
  v: number;
  inBounds: boolean;
}

export interface BerlinCameraDensitySample {
  density: number;
  uv: BerlinHeatmapUv;
  pixelX: number;
  pixelY: number;
}
