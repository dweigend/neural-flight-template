/**
 * Builds renderer-free subchunk raster cells from explicit chunk frames.
 *
 * Intent:
 * Subchunks are a smaller address grid inside caller-owned chunk frames. This
 * file only describes that grid as data; it does not choose templates, render
 * debug lines, or own runtime lifecycle.
 *
 * Architecture:
 * The caller passes already-known chunk bounds and chunk coordinates. Keeping
 * those inputs explicit avoids hidden chunk-size defaults and keeps composition
 * with `roomSegmentation.ts` visible at the route or game boundary.
 */
export type SubchunkRasterCounts = Readonly<{
	xAxisSubchunkCount: number
	yAxisSubchunkCount: number
	zAxisSubchunkCount: number
}>

/**
 * Describes the world-space size of one subchunk cell.
 */
export type SubchunkCellSize = Readonly<{
	subchunkDepth: number
	subchunkHeight: number
	subchunkWidth: number
}>

/**
 * Names coordinates by space instead of using generic x/y/z fields at the API.
 */
export type SubchunkWorldPosition = Readonly<{
	worldPositionX: number
	worldPositionY: number
	worldPositionZ: number
}>

/**
 * Identifies the parent chunk that a raster cell belongs to.
 */
export type SubchunkParentChunkCoordinate = Readonly<{
	chunkCoordinateX: number
	chunkCoordinateY: number
	chunkCoordinateZ: number
}>

/**
 * Identifies a subchunk cell inside either a local or global subchunk grid.
 */
export type SubchunkGridCoordinate = Readonly<{
	subchunkCoordinateX: number
	subchunkCoordinateY: number
	subchunkCoordinateZ: number
}>

export type SubchunkWorldBounds = Readonly<{
	maxWorldPosition: SubchunkWorldPosition
	minWorldPosition: SubchunkWorldPosition
}>

/**
 * Provides all frame-space facts needed to split one chunk into subchunks.
 */
export type SubchunkRasterChunk = Readonly<{
	chunkWorldBounds: SubchunkWorldBounds
	parentChunkCoordinate: SubchunkParentChunkCoordinate
}>

/**
 * Keeps all coordinate spaces attached to a generated subchunk cell.
 */
export type SubchunkCellCoordinate = Readonly<{
	globalSubchunkCoordinate: SubchunkGridCoordinate
	localSubchunkCoordinate: SubchunkGridCoordinate
	parentChunkCoordinate: SubchunkParentChunkCoordinate
}>

/**
 * Describes one addressable cell with enough data for placement and debug adapters.
 */
export type SubchunkCell = Readonly<{
	centerWorldPosition: SubchunkWorldPosition
	key: string
	maxWorldPosition: SubchunkWorldPosition
	minWorldPosition: SubchunkWorldPosition
	subchunkCellCoordinate: SubchunkCellCoordinate
	subchunkCellSize: SubchunkCellSize
}>

export type SubchunkRaster = Readonly<{
	subchunkCells: readonly SubchunkCell[]
	subchunkCounts: SubchunkRasterCounts
}>

/**
 * Requires all subdivision inputs up front so callers own world configuration.
 */
export type SubchunkRasterOptions = Readonly<{
	rasterChunks: readonly SubchunkRasterChunk[]
	subchunkCounts: SubchunkRasterCounts
}>

/**
 * Creates deterministic subchunk cells for explicitly bounded chunks.
 *
 * Throws when required values, bounds, counts, or derived cell sizes are invalid,
 * because hidden defaults would make deterministic placement harder to debug.
 */
export function createSubchunkRaster(options: SubchunkRasterOptions): SubchunkRaster {
	if (!options) {
		throw new Error('Subchunk raster options are required.')
	}

	const { rasterChunks, subchunkCounts } = options
	assertSubchunkCounts(subchunkCounts)
	assertSubchunkRasterChunks(rasterChunks)

	return {
		subchunkCells: rasterChunks.flatMap((rasterChunk) =>
			createRasterChunkSubchunkCells({
				rasterChunk,
				subchunkCounts
			})
		),
		subchunkCounts
	}
}

function createRasterChunkSubchunkCells({
	rasterChunk,
	subchunkCounts
}: Readonly<{
	rasterChunk: SubchunkRasterChunk
	subchunkCounts: SubchunkRasterCounts
}>): readonly SubchunkCell[] {
	const subchunkCellCount =
		subchunkCounts.xAxisSubchunkCount *
		subchunkCounts.yAxisSubchunkCount *
		subchunkCounts.zAxisSubchunkCount
	const subchunkCellSize = createSubchunkCellSize(
		rasterChunk.chunkWorldBounds,
		subchunkCounts
	)

	return Array.from({ length: subchunkCellCount }, (_, cellIndex) =>
		createSubchunkCell({
			cellIndex,
			rasterChunk,
			subchunkCellSize,
			subchunkCounts
		})
	)
}

function createSubchunkCell({
	cellIndex,
	rasterChunk,
	subchunkCellSize,
	subchunkCounts
}: Readonly<{
	cellIndex: number
	rasterChunk: SubchunkRasterChunk
	subchunkCellSize: SubchunkCellSize
	subchunkCounts: SubchunkRasterCounts
}>): SubchunkCell {
	// A flat index keeps this data shape close to future instancing buffers.
	const xyPlaneSubchunkCount =
		subchunkCounts.xAxisSubchunkCount * subchunkCounts.yAxisSubchunkCount
	const localSubchunkCoordinateZ = Math.floor(cellIndex / xyPlaneSubchunkCount)
	const xyPlaneSubchunkIndex = cellIndex % xyPlaneSubchunkCount
	const localSubchunkCoordinateY = Math.floor(
		xyPlaneSubchunkIndex / subchunkCounts.xAxisSubchunkCount
	)
	const localSubchunkCoordinateX =
		xyPlaneSubchunkIndex % subchunkCounts.xAxisSubchunkCount
	const minWorldPosition = {
		worldPositionX:
			rasterChunk.chunkWorldBounds.minWorldPosition.worldPositionX +
			localSubchunkCoordinateX * subchunkCellSize.subchunkWidth,
		worldPositionY:
			rasterChunk.chunkWorldBounds.minWorldPosition.worldPositionY +
			localSubchunkCoordinateY * subchunkCellSize.subchunkHeight,
		worldPositionZ:
			rasterChunk.chunkWorldBounds.minWorldPosition.worldPositionZ +
			localSubchunkCoordinateZ * subchunkCellSize.subchunkDepth
	}
	const maxWorldPosition = {
		worldPositionX: minWorldPosition.worldPositionX + subchunkCellSize.subchunkWidth,
		worldPositionY: minWorldPosition.worldPositionY + subchunkCellSize.subchunkHeight,
		worldPositionZ: minWorldPosition.worldPositionZ + subchunkCellSize.subchunkDepth
	}

	return {
		centerWorldPosition: {
			worldPositionX:
				(minWorldPosition.worldPositionX + maxWorldPosition.worldPositionX) / 2,
			worldPositionY:
				(minWorldPosition.worldPositionY + maxWorldPosition.worldPositionY) / 2,
			worldPositionZ:
				(minWorldPosition.worldPositionZ + maxWorldPosition.worldPositionZ) / 2
		},
		key: `${rasterChunk.parentChunkCoordinate.chunkCoordinateX}:${rasterChunk.parentChunkCoordinate.chunkCoordinateY}:${rasterChunk.parentChunkCoordinate.chunkCoordinateZ}/${localSubchunkCoordinateX}:${localSubchunkCoordinateY}:${localSubchunkCoordinateZ}`,
		maxWorldPosition,
		minWorldPosition,
		subchunkCellCoordinate: {
			globalSubchunkCoordinate: {
				subchunkCoordinateX:
					rasterChunk.parentChunkCoordinate.chunkCoordinateX *
						subchunkCounts.xAxisSubchunkCount +
					localSubchunkCoordinateX,
				subchunkCoordinateY:
					rasterChunk.parentChunkCoordinate.chunkCoordinateY *
						subchunkCounts.yAxisSubchunkCount +
					localSubchunkCoordinateY,
				subchunkCoordinateZ:
					rasterChunk.parentChunkCoordinate.chunkCoordinateZ *
						subchunkCounts.zAxisSubchunkCount +
					localSubchunkCoordinateZ
			},
			localSubchunkCoordinate: {
				subchunkCoordinateX: localSubchunkCoordinateX,
				subchunkCoordinateY: localSubchunkCoordinateY,
				subchunkCoordinateZ: localSubchunkCoordinateZ
			},
			parentChunkCoordinate: rasterChunk.parentChunkCoordinate
		},
		subchunkCellSize
	}
}

function createSubchunkCellSize(
	chunkWorldBounds: SubchunkWorldBounds,
	subchunkCounts: SubchunkRasterCounts
): SubchunkCellSize {
	// Cell size is derived from explicit bounds; no chunk defaults are re-created here.
	const subchunkCellSize = {
		subchunkDepth:
			(chunkWorldBounds.maxWorldPosition.worldPositionZ -
				chunkWorldBounds.minWorldPosition.worldPositionZ) /
			subchunkCounts.zAxisSubchunkCount,
		subchunkHeight:
			(chunkWorldBounds.maxWorldPosition.worldPositionY -
				chunkWorldBounds.minWorldPosition.worldPositionY) /
			subchunkCounts.yAxisSubchunkCount,
		subchunkWidth:
			(chunkWorldBounds.maxWorldPosition.worldPositionX -
				chunkWorldBounds.minWorldPosition.worldPositionX) /
			subchunkCounts.xAxisSubchunkCount
	}

	assertPositiveFiniteNumber('subchunkWidth', subchunkCellSize.subchunkWidth)
	assertPositiveFiniteNumber('subchunkHeight', subchunkCellSize.subchunkHeight)
	assertPositiveFiniteNumber('subchunkDepth', subchunkCellSize.subchunkDepth)

	return subchunkCellSize
}

function assertSubchunkRasterChunks(
	rasterChunks: readonly SubchunkRasterChunk[]
): void {
	if (!Array.isArray(rasterChunks)) {
		throw new Error('Subchunk raster chunks are required.')
	}

	for (const rasterChunk of rasterChunks) {
		assertSubchunkRasterChunk(rasterChunk)
	}
}

function assertSubchunkRasterChunk(rasterChunk: SubchunkRasterChunk): void {
	if (!rasterChunk) {
		throw new Error('Subchunk raster chunk is required.')
	}

	assertParentChunkCoordinate(rasterChunk.parentChunkCoordinate)
	assertChunkWorldBounds(rasterChunk.chunkWorldBounds)
}

function assertParentChunkCoordinate(
	parentChunkCoordinate: SubchunkParentChunkCoordinate
): void {
	if (!parentChunkCoordinate) {
		throw new Error('Subchunk raster chunk coordinate is required.')
	}

	assertFiniteInteger(
		'parentChunkCoordinate.chunkCoordinateX',
		parentChunkCoordinate.chunkCoordinateX
	)
	assertFiniteInteger(
		'parentChunkCoordinate.chunkCoordinateY',
		parentChunkCoordinate.chunkCoordinateY
	)
	assertFiniteInteger(
		'parentChunkCoordinate.chunkCoordinateZ',
		parentChunkCoordinate.chunkCoordinateZ
	)
}

function assertChunkWorldBounds(chunkWorldBounds: SubchunkWorldBounds): void {
	if (!chunkWorldBounds) {
		throw new Error('Subchunk raster chunk bounds are required.')
	}

	assertWorldPosition(
		'chunkWorldBounds.minWorldPosition',
		chunkWorldBounds.minWorldPosition
	)
	assertWorldPosition(
		'chunkWorldBounds.maxWorldPosition',
		chunkWorldBounds.maxWorldPosition
	)
	assertBoundsAxis(
		'worldPositionX',
		chunkWorldBounds.minWorldPosition.worldPositionX,
		chunkWorldBounds.maxWorldPosition.worldPositionX
	)
	assertBoundsAxis(
		'worldPositionY',
		chunkWorldBounds.minWorldPosition.worldPositionY,
		chunkWorldBounds.maxWorldPosition.worldPositionY
	)
	assertBoundsAxis(
		'worldPositionZ',
		chunkWorldBounds.minWorldPosition.worldPositionZ,
		chunkWorldBounds.maxWorldPosition.worldPositionZ
	)
}

function assertWorldPosition(name: string, worldPosition: SubchunkWorldPosition): void {
	if (!worldPosition) {
		throw new Error(`Subchunk raster "${name}" is required.`)
	}

	assertFiniteNumber(`${name}.worldPositionX`, worldPosition.worldPositionX)
	assertFiniteNumber(`${name}.worldPositionY`, worldPosition.worldPositionY)
	assertFiniteNumber(`${name}.worldPositionZ`, worldPosition.worldPositionZ)
}

function assertBoundsAxis(
	axis: keyof SubchunkWorldPosition,
	min: number,
	max: number
): void {
	if (max <= min) {
		throw new Error(
			`Subchunk raster bounds axis "${axis}" must have max greater than min.`
		)
	}
}

function assertSubchunkCounts(subchunkCounts: SubchunkRasterCounts): void {
	if (!subchunkCounts) {
		throw new Error('Subchunk raster counts are required.')
	}

	assertPositiveInteger('xAxisSubchunkCount', subchunkCounts.xAxisSubchunkCount)
	assertPositiveInteger('yAxisSubchunkCount', subchunkCounts.yAxisSubchunkCount)
	assertPositiveInteger('zAxisSubchunkCount', subchunkCounts.zAxisSubchunkCount)
}

function assertPositiveInteger(name: keyof SubchunkRasterCounts, value: number): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`Subchunk raster count "${name}" must be a positive integer.`)
	}
}

function assertFiniteInteger(name: string, value: number): void {
	if (!Number.isInteger(value)) {
		throw new Error(`Subchunk raster "${name}" must be a finite integer.`)
	}
}

function assertFiniteNumber(name: string, value: number): void {
	if (!Number.isFinite(value)) {
		throw new Error(`Subchunk raster "${name}" must be a finite number.`)
	}
}

function assertPositiveFiniteNumber(name: keyof SubchunkCellSize, value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(
			`Subchunk raster cell size "${name}" must be a positive finite number.`
		)
	}
}
