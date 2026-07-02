import {
	type ChunkCoordinate,
	type ChunkDimensions,
	type ChunkKey,
	type WorldPosition,
} from "$lib/experiences/visio-technologica/chunk-core";
import {
	VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID,
	type VisioTechnologicaLogicalTileMetadata,
	type WorldTileFile,
	type WorldTileId,
} from "$lib/experiences/visio-technologica/tile-metadata";
import {
	createVisioTileChunkCoordinate,
	createVisioTileChunkKey,
	createVisioTileChunkWorldBounds,
	createVisioTileChunkWorldCenter,
	createVisioTileChunkWorldOrigin,
} from "./visioTileChunkMath";

export const VISIO_TILE_CHUNK_DIMENSIONS: ChunkDimensions = {
	depth: 1,
	height: 1,
	width: 1,
};

export type VisioTileChunkManifestEntry = Readonly<{
	chunkCoordinate: ChunkCoordinate;
	chunkKey: ChunkKey;
	fileName: WorldTileFile;
	id: WorldTileId;
	isStarter: boolean;
	logicalCoordinate: VisioTechnologicaLogicalTileMetadata["logicalCoordinate"];
	sourceCenter: VisioTechnologicaLogicalTileMetadata["center"];
	tileMetadata: VisioTechnologicaLogicalTileMetadata;
	worldBounds: ReturnType<typeof createVisioTileChunkWorldBounds>;
	worldCenter: WorldPosition;
	worldOrigin: WorldPosition;
}>;

export type VisioTileChunkManifest = Readonly<{
	chunkDimensions: ChunkDimensions;
	entries: readonly VisioTileChunkManifestEntry[];
	entriesByChunkKey: ReadonlyMap<ChunkKey, readonly VisioTileChunkManifestEntry[]>;
	entryByFileName: ReadonlyMap<WorldTileFile, VisioTileChunkManifestEntry>;
	entryById: ReadonlyMap<WorldTileId, VisioTileChunkManifestEntry>;
	starterEntries: readonly VisioTileChunkManifestEntry[];
}>;

export function createVisioTileChunkManifest({
	chunkDimensions,
	tiles,
}: Readonly<{
	chunkDimensions: ChunkDimensions;
	tiles: readonly VisioTechnologicaLogicalTileMetadata[];
}>): VisioTileChunkManifest {
	const entries = tiles.map((tileMetadata) => createVisioTileChunkManifestEntry(tileMetadata, chunkDimensions));
	const entriesByChunkKey = new Map<ChunkKey, readonly VisioTileChunkManifestEntry[]>(
		Array.from(groupEntriesByChunkKey(entries).entries()),
	);
	const entryByFileName = new Map<WorldTileFile, VisioTileChunkManifestEntry>(
		entries.map((entry) => [entry.fileName, entry]),
	);
	const entryById = new Map<WorldTileId, VisioTileChunkManifestEntry>(
		entries.map((entry) => [entry.id, entry]),
	);

	return {
		chunkDimensions,
		entries,
		entriesByChunkKey,
		entryByFileName,
		entryById,
		starterEntries: entries.filter((entry) => entry.isStarter),
	};
}

function createVisioTileChunkManifestEntry(
	tileMetadata: VisioTechnologicaLogicalTileMetadata,
	chunkDimensions: ChunkDimensions,
): VisioTileChunkManifestEntry {
	return {
		chunkCoordinate: createVisioTileChunkCoordinate(tileMetadata),
		chunkKey: createVisioTileChunkKey(tileMetadata),
		fileName: tileMetadata.fileName,
		id: tileMetadata.id,
		isStarter: tileMetadata.isStarter,
		logicalCoordinate: tileMetadata.logicalCoordinate,
		sourceCenter: tileMetadata.center,
		tileMetadata,
		worldBounds: createVisioTileChunkWorldBounds(tileMetadata, chunkDimensions),
		worldCenter: createVisioTileChunkWorldCenter(tileMetadata, chunkDimensions),
		worldOrigin: createVisioTileChunkWorldOrigin(tileMetadata, chunkDimensions),
	};
}

function groupEntriesByChunkKey(
	entries: readonly VisioTileChunkManifestEntry[],
): Map<ChunkKey, readonly VisioTileChunkManifestEntry[]> {
	const groupedEntries = new Map<ChunkKey, VisioTileChunkManifestEntry[]>();

	for (const entry of entries) {
		const currentEntries = groupedEntries.get(entry.chunkKey);
		if (currentEntries) {
			currentEntries.push(entry);
			continue;
		}

		groupedEntries.set(entry.chunkKey, [entry]);
	}

	return groupedEntries;
}

export const VISIO_TILE_CHUNK_MANIFEST = createVisioTileChunkManifest({
	chunkDimensions: VISIO_TILE_CHUNK_DIMENSIONS,
	tiles: VISIO_TECHNOLOGICA_LOGICAL_TILE_GRID,
});

export function getVisioTileChunkManifestEntryById(
	id: WorldTileId,
): VisioTileChunkManifestEntry {
	const entry = VISIO_TILE_CHUNK_MANIFEST.entryById.get(id);
	if (!entry) {
		throw new Error(`Unknown Visio Technologica tile id: ${id}`);
	}

	return entry;
}

export function getVisioTileChunkManifestEntryByFileName(
	fileName: WorldTileFile,
): VisioTileChunkManifestEntry {
	const entry = VISIO_TILE_CHUNK_MANIFEST.entryByFileName.get(fileName);
	if (!entry) {
		throw new Error(`Unknown Visio Technologica tile file: ${fileName}`);
	}

	return entry;
}

export function getVisioTileChunkManifestEntriesByChunkKey(
	chunkKey: ChunkKey,
): readonly VisioTileChunkManifestEntry[] {
	return VISIO_TILE_CHUNK_MANIFEST.entriesByChunkKey.get(chunkKey) ?? [];
}
