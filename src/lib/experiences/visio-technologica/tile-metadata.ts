export interface VisioTechnologicaTileCenter {
  x: number;
  y: number;
}

export interface VisioTechnologicaLogicalTileCoordinate {
  column: number;
  row: number;
}

/**
 * Lightweight geometry-free tile manifest used for streaming decisions.
 *
 * `center` is intentionally stored in the source tile-grid coordinate space
 * encoded in the asset names. This keeps the manifest explicit and stable
 * without requiring any GLB loads just to reason about chunk proximity.
 */
export const VISIO_TECHNOLOGICA_TILE_METADATA = [
  {
    id: "3887-58193",
    fileName: "Mesh_3887_58193_-002.glb",
    center: { x: 3887, y: 58193 },
    isStarter: false,
  },
  {
    id: "3887-58196",
    fileName: "Mesh_3887_58196_-002.glb",
    center: { x: 3887, y: 58196 },
    isStarter: false,
  },
  {
    id: "3887-58200",
    fileName: "Mesh_3887_58200_-002.glb",
    center: { x: 3887, y: 58200 },
    isStarter: false,
  },
  {
    id: "3887-58203",
    fileName: "Mesh_3887_58203_-002.glb",
    center: { x: 3887, y: 58203 },
    isStarter: false,
  },
  {
    id: "3890-58193",
    fileName: "Mesh_3890_58193_-002.glb",
    center: { x: 3890, y: 58193 },
    isStarter: false,
  },
  {
    id: "3890-58196",
    fileName: "Mesh_3890_58196_-002.glb",
    center: { x: 3890, y: 58196 },
    isStarter: false,
  },
  {
    id: "3890-58200",
    fileName: "Mesh_3890_58200_-002.glb",
    center: { x: 3890, y: 58200 },
    isStarter: true,
  },
  {
    id: "3890-58203",
    fileName: "Mesh_3890_58203_-002.glb",
    center: { x: 3890, y: 58203 },
    isStarter: true,
  },
  {
    id: "3890-58207",
    fileName: "Mesh_3890_58207_-002.glb",
    center: { x: 3890, y: 58207 },
    isStarter: false,
  },
  {
    id: "3894-58196",
    fileName: "Mesh_3894_58196_-002.glb",
    center: { x: 3894, y: 58196 },
    isStarter: false,
  },
  {
    id: "3894-58200",
    fileName: "Mesh_3894_58200_-002.glb",
    center: { x: 3894, y: 58200 },
    isStarter: true,
  },
  {
    id: "3894-58203",
    fileName: "Mesh_3894_58203_-002.glb",
    center: { x: 3894, y: 58203 },
    isStarter: true,
  },
  {
    id: "3894-58207",
    fileName: "Mesh_3894_58207_-002.glb",
    center: { x: 3894, y: 58207 },
    isStarter: false,
  },
  {
    id: "3898-58196",
    fileName: "Mesh_3898_58196_-002.glb",
    center: { x: 3898, y: 58196 },
    isStarter: false,
  },
  {
    id: "3898-58200",
    fileName: "Mesh_3898_58200_-002.glb",
    center: { x: 3898, y: 58200 },
    isStarter: false,
  },
  {
    id: "3898-58203",
    fileName: "Mesh_3898_58203_-002.glb",
    center: { x: 3898, y: 58203 },
    isStarter: false,
  },
  {
    id: "3898-58207",
    fileName: "Mesh_3898_58207_-002.glb",
    center: { x: 3898, y: 58207 },
    isStarter: false,
  },
] as const satisfies readonly {
  id: string;
  fileName: string;
  center: VisioTechnologicaTileCenter;
  isStarter: boolean;
}[];

const LOGICAL_TILE_COLUMNS = [
  ...new Set(VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => tile.center.x)),
].sort((left, right) => left - right);

const LOGICAL_TILE_ROWS = [
  ...new Set(VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => tile.center.y)),
].sort((left, right) => left - right);

const LOGICAL_TILE_COLUMN_INDEX_BY_CENTER_X = new Map<number, number>(
  LOGICAL_TILE_COLUMNS.map((centerX, index) => [centerX, index]),
);

const LOGICAL_TILE_ROW_INDEX_BY_CENTER_Y = new Map<number, number>(
  LOGICAL_TILE_ROWS.map((centerY, index) => [centerY, index]),
);

function getLogicalTileCoordinate(
  center: VisioTechnologicaTileCenter,
): VisioTechnologicaLogicalTileCoordinate {
  const column = LOGICAL_TILE_COLUMN_INDEX_BY_CENTER_X.get(center.x);
  const row = LOGICAL_TILE_ROW_INDEX_BY_CENTER_Y.get(center.y);

  if (column === undefined || row === undefined) {
    throw new Error(
      `Unable to derive logical Visio Technologica tile coordinate for source center (${center.x}, ${center.y})`,
    );
  }

  return { column, row };
}

export const VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID: readonly (VisioTechnologicaTileMetadata & {
  logicalCoordinate: VisioTechnologicaLogicalTileCoordinate;
})[] = VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => ({
  ...tile,
  logicalCoordinate: getLogicalTileCoordinate(tile.center),
}));

export type VisioTechnologicaTileMetadata =
  (typeof VISIO_TECHNOLOGICA_TILE_METADATA)[number];
export type VisioTechnologicaLogicalTileMetadata =
  (typeof VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID)[number];
export type WorldTileFile = VisioTechnologicaTileMetadata["fileName"];
export type WorldTileId = VisioTechnologicaTileMetadata["id"];

export const WORLD_TILE_FILES: readonly WorldTileFile[] =
  VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => tile.fileName);

export const STARTER_WORLD_TILE_FILES: readonly WorldTileFile[] =
  VISIO_TECHNOLOGICA_TILE_METADATA.filter((tile) => tile.isStarter).map(
    (tile) => tile.fileName,
  );

export const DEFERRED_WORLD_TILE_FILES: readonly WorldTileFile[] =
  VISIO_TECHNOLOGICA_TILE_METADATA.filter((tile) => !tile.isStarter).map(
    (tile) => tile.fileName,
  );

export const VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID_COLUMNS =
  LOGICAL_TILE_COLUMNS;

export const VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID_ROWS = LOGICAL_TILE_ROWS;

const TILE_METADATA_BY_FILE_NAME = new Map<
  WorldTileFile,
  VisioTechnologicaTileMetadata
>(VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => [tile.fileName, tile]));

const TILE_METADATA_BY_ID = new Map<WorldTileId, VisioTechnologicaTileMetadata>(
  VISIO_TECHNOLOGICA_TILE_METADATA.map((tile) => [tile.id, tile]),
);

const LOGICAL_TILE_METADATA_BY_FILE_NAME = new Map<
  WorldTileFile,
  VisioTechnologicaLogicalTileMetadata
>(VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID.map((tile) => [tile.fileName, tile]));

const LOGICAL_TILE_METADATA_BY_ID = new Map<
  WorldTileId,
  VisioTechnologicaLogicalTileMetadata
>(VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID.map((tile) => [tile.id, tile]));

export function getTileMetadataByFileName(
  fileName: WorldTileFile,
): VisioTechnologicaTileMetadata {
  const metadata = TILE_METADATA_BY_FILE_NAME.get(fileName);
  if (!metadata) {
    throw new Error(`Unknown Visio Technologica tile file: ${fileName}`);
  }

  return metadata;
}

export function getTileMetadataById(
  id: WorldTileId,
): VisioTechnologicaTileMetadata {
  const metadata = TILE_METADATA_BY_ID.get(id);
  if (!metadata) {
    throw new Error(`Unknown Visio Technologica tile id: ${id}`);
  }

  return metadata;
}

export function getLogicalTileMetadataByFileName(
  fileName: WorldTileFile,
): VisioTechnologicaLogicalTileMetadata {
  const metadata = LOGICAL_TILE_METADATA_BY_FILE_NAME.get(fileName);
  if (!metadata) {
    throw new Error(`Unknown Visio Technologica tile file: ${fileName}`);
  }

  return metadata;
}

export function getLogicalTileMetadataById(
  id: WorldTileId,
): VisioTechnologicaLogicalTileMetadata {
  const metadata = LOGICAL_TILE_METADATA_BY_ID.get(id);
  if (!metadata) {
    throw new Error(`Unknown Visio Technologica tile id: ${id}`);
  }

  return metadata;
}
