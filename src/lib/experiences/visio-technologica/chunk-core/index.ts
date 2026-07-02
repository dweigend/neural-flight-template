/**
 * Exposes the public renderer-free chunk core API.
 */
export type {
	ChunkBounds,
	ChunkCoordinate,
	ChunkCoordinateGridOptions,
	ChunkCoordinateOffset,
	ChunkDimensions,
	ChunkGridCounts,
	ChunkKey,
	KeyedChunkBounds,
	KeyedChunkBoundsOptions,
	WorldPosition
} from './roomSegmentation'
export {
	createCenteredChunkGridCoordinates,
	createKeyedChunkBounds,
	getChunkBounds,
	getChunkBoundsEnvelope,
	getChunkCoordinate,
	getChunkKey,
	getChunkOrigin
} from './roomSegmentation'
export {
	createSubchunkRaster,
	type SubchunkCell,
	type SubchunkCellCoordinate,
	type SubchunkCellSize,
	type SubchunkGridCoordinate,
	type SubchunkParentChunkCoordinate,
	type SubchunkRaster,
	type SubchunkRasterChunk,
	type SubchunkRasterCounts,
	type SubchunkRasterOptions,
	type SubchunkWorldBounds,
	type SubchunkWorldPosition
} from './subchunkRaster'
