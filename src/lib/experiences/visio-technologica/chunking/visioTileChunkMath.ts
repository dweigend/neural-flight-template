import {
	getChunkBounds,
	getChunkKey,
	getChunkOrigin,
	type ChunkBounds,
	type ChunkCoordinate,
	type ChunkDimensions,
	type ChunkKey,
	type WorldPosition,
} from "$lib/experiences/visio-technologica/chunk-core";
import type { VisioTechnologicaLogicalTileMetadata } from "$lib/experiences/visio-technologica/tile-metadata";

export function createVisioTileChunkCoordinate(
	tile: Pick<VisioTechnologicaLogicalTileMetadata, "logicalCoordinate">,
): ChunkCoordinate {
	return {
		x: tile.logicalCoordinate.column,
		y: 0,
		z: tile.logicalCoordinate.row,
	};
}

export function createVisioTileChunkKey(
	tile: Pick<VisioTechnologicaLogicalTileMetadata, "logicalCoordinate">,
): ChunkKey {
	return getChunkKey(createVisioTileChunkCoordinate(tile));
}

export function createVisioTileChunkWorldOrigin(
	tile: Pick<VisioTechnologicaLogicalTileMetadata, "logicalCoordinate">,
	chunkDimensions: ChunkDimensions,
): WorldPosition {
	return getChunkOrigin(createVisioTileChunkCoordinate(tile), chunkDimensions);
}

export function createVisioTileChunkWorldBounds(
	tile: Pick<VisioTechnologicaLogicalTileMetadata, "logicalCoordinate">,
	chunkDimensions: ChunkDimensions,
): ChunkBounds {
	return getChunkBounds(createVisioTileChunkCoordinate(tile), chunkDimensions);
}

export function createVisioTileChunkWorldCenter(
	tile: Pick<VisioTechnologicaLogicalTileMetadata, "logicalCoordinate">,
	chunkDimensions: ChunkDimensions,
): WorldPosition {
	const origin = createVisioTileChunkWorldOrigin(tile, chunkDimensions);

	return {
		x: origin.x + chunkDimensions.width / 2,
		y: origin.y + chunkDimensions.height / 2,
		z: origin.z + chunkDimensions.depth / 2,
	};
}
