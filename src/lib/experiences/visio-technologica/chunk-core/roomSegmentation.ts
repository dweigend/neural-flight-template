/**
 * Converts between world positions and renderer-free chunk-space data.
 *
 * Chunk coordinates are mathematical grid addresses. Negative world positions
 * intentionally map to negative chunk coordinates through `Math.floor`, so the
 * grid stays continuous on both sides of the origin.
 */
const CHUNK_KEY_SEPARATOR = ':'

export type ChunkDimensions = Readonly<{
	depth: number
	height: number
	width: number
}>

export type WorldPosition = Readonly<{
	x: number
	y: number
	z: number
}>

export type ChunkCoordinate = Readonly<{
	x: number
	y: number
	z: number
}>

export type ChunkGridCounts = Readonly<{
	xAxisChunkCount: number
	yAxisChunkCount: number
	zAxisChunkCount: number
}>

export type ChunkCoordinateOffset = ChunkCoordinate

export type ChunkBounds = Readonly<{
	max: WorldPosition
	min: WorldPosition
}>

export type ChunkKey = `${number}:${number}:${number}`

export type KeyedChunkBounds = ChunkBounds &
	Readonly<{
		coordinate: ChunkCoordinate
		key: ChunkKey
	}>

export type ChunkCoordinateGridOptions = Readonly<{
	coordinateOffset: ChunkCoordinateOffset
	counts: ChunkGridCounts
}>

export type KeyedChunkBoundsOptions = Readonly<{
	coordinates: readonly ChunkCoordinate[]
	dimensions: ChunkDimensions
}>

/**
 * Maps a world position to the chunk coordinate that contains it.
 */
export function getChunkCoordinate(
	position: WorldPosition,
	dimensions: ChunkDimensions
): ChunkCoordinate {
	assertChunkDimensions(dimensions)

	return {
		x: Math.floor(position.x / dimensions.width),
		y: Math.floor(position.y / dimensions.height),
		z: Math.floor(position.z / dimensions.depth)
	}
}

/**
 * Creates the stable string address used for maps, debug labels, and seeds.
 */
export function getChunkKey(coordinate: ChunkCoordinate): ChunkKey {
	return [coordinate.x, coordinate.y, coordinate.z].join(
		CHUNK_KEY_SEPARATOR
	) as ChunkKey
}

/**
 * Returns the minimum world-space corner of a chunk coordinate.
 */
export function getChunkOrigin(
	coordinate: ChunkCoordinate,
	dimensions: ChunkDimensions
): WorldPosition {
	assertChunkDimensions(dimensions)

	return {
		x: coordinate.x * dimensions.width,
		y: coordinate.y * dimensions.height,
		z: coordinate.z * dimensions.depth
	}
}

/**
 * Returns the world-space bounds for one chunk coordinate.
 */
export function getChunkBounds(
	coordinate: ChunkCoordinate,
	dimensions: ChunkDimensions
): ChunkBounds {
	assertChunkDimensions(dimensions)

	const min = getChunkOrigin(coordinate, dimensions)

	return {
		max: {
			x: min.x + dimensions.width,
			y: min.y + dimensions.height,
			z: min.z + dimensions.depth
		},
		min
	}
}

/**
 * Creates centered chunk coordinates from explicit axis counts and an offset.
 *
 * The centering is mechanical; the caller still owns camera or world placement
 * by passing the offset explicitly at the composition boundary.
 */
export function createCenteredChunkGridCoordinates({
	coordinateOffset,
	counts
}: ChunkCoordinateGridOptions): readonly ChunkCoordinate[] {
	assertChunkGridCounts(counts)
	assertChunkCoordinateOffset(coordinateOffset)

	const chunkPlaneCount = counts.xAxisChunkCount * counts.yAxisChunkCount
	const chunkTotalCount = chunkPlaneCount * counts.zAxisChunkCount
	const centeredOffsetX = Math.floor(counts.xAxisChunkCount / 2)
	const centeredOffsetY = Math.floor(counts.yAxisChunkCount / 2)
	const centeredOffsetZ = Math.floor(counts.zAxisChunkCount / 2)

	return Array.from({ length: chunkTotalCount }, (_, chunkIndex) => {
		const chunkZIndex = Math.floor(chunkIndex / chunkPlaneCount)
		const chunkPlaneIndex = chunkIndex % chunkPlaneCount
		const chunkYIndex = Math.floor(chunkPlaneIndex / counts.xAxisChunkCount)
		const chunkXIndex = chunkPlaneIndex % counts.xAxisChunkCount

		return {
			x: chunkXIndex - centeredOffsetX + coordinateOffset.x,
			y: chunkYIndex - centeredOffsetY + coordinateOffset.y,
			z: chunkZIndex - centeredOffsetZ + coordinateOffset.z
		}
	})
}

/**
 * Creates keyed chunk bounds for caller-provided chunk coordinates.
 */
export function createKeyedChunkBounds({
	coordinates,
	dimensions
}: KeyedChunkBoundsOptions): readonly KeyedChunkBounds[] {
	assertChunkDimensions(dimensions)

	if (!Array.isArray(coordinates)) {
		throw new Error('Chunk bounds coordinates are required.')
	}

	return coordinates.map((chunkCoordinate) => ({
		...getChunkBounds(chunkCoordinate, dimensions),
		coordinate: chunkCoordinate,
		key: getChunkKey(chunkCoordinate)
	}))
}

/**
 * Returns the smallest world-space bounds that contains all provided bounds.
 */
export function getChunkBoundsEnvelope(bounds: readonly ChunkBounds[]): ChunkBounds {
	if (!Array.isArray(bounds) || bounds.length === 0) {
		throw new Error('Chunk bounds envelope requires at least one bounds entry.')
	}

	return {
		max: bounds.reduce<WorldPosition>(
			(currentMax, chunkBounds) => ({
				x: Math.max(currentMax.x, chunkBounds.max.x),
				y: Math.max(currentMax.y, chunkBounds.max.y),
				z: Math.max(currentMax.z, chunkBounds.max.z)
			}),
			bounds[0].max
		),
		min: bounds.reduce<WorldPosition>(
			(currentMin, chunkBounds) => ({
				x: Math.min(currentMin.x, chunkBounds.min.x),
				y: Math.min(currentMin.y, chunkBounds.min.y),
				z: Math.min(currentMin.z, chunkBounds.min.z)
			}),
			bounds[0].min
		)
	}
}

function assertChunkDimensions(dimensions: ChunkDimensions): void {
	if (!dimensions) {
		throw new Error('Chunk dimensions are required.')
	}

	assertPositiveFiniteNumber('width', dimensions.width)
	assertPositiveFiniteNumber('height', dimensions.height)
	assertPositiveFiniteNumber('depth', dimensions.depth)
}

function assertPositiveFiniteNumber(name: keyof ChunkDimensions, value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`Chunk dimension "${name}" must be a positive finite number.`)
	}
}

function assertChunkGridCounts(counts: ChunkGridCounts): void {
	if (!counts) {
		throw new Error('Chunk grid counts are required.')
	}

	assertPositiveInteger('xAxisChunkCount', counts.xAxisChunkCount)
	assertPositiveInteger('yAxisChunkCount', counts.yAxisChunkCount)
	assertPositiveInteger('zAxisChunkCount', counts.zAxisChunkCount)
}

function assertChunkCoordinateOffset(offset: ChunkCoordinateOffset): void {
	if (!offset) {
		throw new Error('Chunk grid offset is required.')
	}

	assertFiniteInteger('x', offset.x)
	assertFiniteInteger('y', offset.y)
	assertFiniteInteger('z', offset.z)
}

function assertPositiveInteger(name: keyof ChunkGridCounts, value: number): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`Chunk grid count "${name}" must be a positive integer.`)
	}
}

function assertFiniteInteger(name: keyof ChunkCoordinateOffset, value: number): void {
	if (!Number.isInteger(value)) {
		throw new Error(`Chunk grid offset "${name}" must be a finite integer.`)
	}
}
