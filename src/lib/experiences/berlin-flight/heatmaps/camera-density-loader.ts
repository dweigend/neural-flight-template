import {
  createBerlinFallbackCameraDensitySampler,
  createBerlinCameraDensitySampler,
  loadBerlinCameraDensityAssetContract,
  parseBerlinHeatmapBounds,
} from "./camera-density";
import rawBounds from "./camera-density.berlin.json";
import type { BerlinCameraDensitySampler } from "./types";

let berlinCameraDensitySamplerPromise: Promise<BerlinCameraDensitySampler> | null =
  null;
let berlinCameraDensitySampler: BerlinCameraDensitySampler | null = null;

export function preloadBerlinCameraDensitySampler(): Promise<BerlinCameraDensitySampler> {
  if (!berlinCameraDensitySamplerPromise) {
    berlinCameraDensitySamplerPromise = loadBerlinCameraDensitySampler();
  }

  return berlinCameraDensitySamplerPromise;
}

export function getBerlinCameraDensitySampler(): BerlinCameraDensitySampler | null {
  return berlinCameraDensitySampler;
}

export function setBerlinCameraDensitySamplerForTests(
  sampler: BerlinCameraDensitySampler | null,
): void {
  berlinCameraDensitySampler = sampler;
  berlinCameraDensitySamplerPromise = sampler ? Promise.resolve(sampler) : null;
}

async function loadBerlinCameraDensitySampler(): Promise<BerlinCameraDensitySampler> {
  let sampler: BerlinCameraDensitySampler;

  try {
    const assetContract = await loadBerlinCameraDensityAssetContract();
    const rgba = await decodeBerlinCameraDensityRgba(assetContract.imageUrl);
    sampler = createBerlinCameraDensitySampler({
      imageOrientation: assetContract.imageOrientation,
      bounds: assetContract.bounds,
      width: rgba.width,
      height: rgba.height,
      rgba: rgba.data,
    });
  } catch (error) {
    console.warn(
      "[BerlinFlight] Camera density heatmap unavailable. Falling back to max density placement everywhere.",
      error,
    );
    sampler = createBerlinFallbackCameraDensitySampler(
      parseBerlinHeatmapBounds(rawBounds),
    );
  }

  berlinCameraDensitySampler = sampler;
  return sampler;
}

async function decodeBerlinCameraDensityRgba(
  imageUrl: string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `[BerlinFlight] Failed to load camera density heatmap PNG: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    imageBitmap.close();
    throw new Error("[BerlinFlight] Could not create a 2D canvas for the camera density heatmap.");
  }

  context.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const { data, width, height } = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return { data, width, height };
}
