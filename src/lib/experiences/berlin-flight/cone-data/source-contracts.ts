export interface BerlinConeSourceManifestEntry {
  path: string;
  sourceUrl?: string;
}

export interface BerlinConeSourceManifest {
  version: 1;
  sources: readonly BerlinConeSourceManifestEntry[];
  outputDir?: string;
  heatmapImagePath?: string;
  heatmapBoundsPath?: string;
}

export interface BerlinConeSourceMeshRecord {
  positions: readonly number[];
  matrixWorld?: readonly number[];
  sourceUrl?: string;
}

export interface BerlinConeSourceMeshFile {
  version: 1;
  meshes: readonly BerlinConeSourceMeshRecord[];
}
