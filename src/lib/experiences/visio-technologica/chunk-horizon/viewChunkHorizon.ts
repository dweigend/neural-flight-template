/**
 * Selects the memoryless chunk event horizon for a world-space observer.
 *
 * `chunk-core` owns the structural facts: coordinates, keys, dimensions, and
 * bounds. This layer owns the view policy: which chunk bounds belong to the
 * current observer horizon and how strongly they should fade near the distance
 * or field-of-view edge.
 */
import type {
	ChunkCoordinate,
	ChunkDimensions,
	KeyedChunkBounds,
	WorldPosition
} from '../chunk-core'
import {
	createCenteredChunkGridCoordinates,
	createKeyedChunkBounds,
	getChunkCoordinate,
	getChunkKey
} from '../chunk-core'

const HALF_TURN_RADIANS = Math.PI
const HORIZON_POSITION_SIGNATURE_PRECISION = 1
const HORIZON_SIGNATURE_PRECISION = 100

/**
 * A normalized or normalizable direction expressed in world space.
 *
 * Core horizon functions use plain vector data so callers can pass vectors from
 * Three.js, tests, or another runtime without coupling this module to a renderer.
 */
export type WorldDirection = Readonly<{
	x: number
	y: number
	z: number
}>

type WorldDirectionBasis = Readonly<{
	forwardWorldDirection: WorldDirection
	rightWorldDirection: WorldDirection
	upWorldDirection: WorldDirection
}>

type ExpandedFov = Readonly<{
	horizontalHalfRadians: number
	verticalHalfRadians: number
}>

type ViewAngles = Readonly<{
	horizontalRadians: number
	verticalRadians: number
}>

type VisibleChunkProjection = Readonly<{
	distanceFromObserver: number
	fadeProgress: number
}>

type ChunkViewHorizonContext = Readonly<{
	chunkRadius: number
	dimensions: ChunkDimensions
	expandedFov: ExpandedFov
	fadeStartRatio: number
	observerWorldPosition: WorldPosition
	viewBasis: WorldDirectionBasis
	viewDistance: number
}>

export type ChunkViewHorizonOptions = Readonly<{
	dimensions: ChunkDimensions
	edgeBufferRadians: number
	fadeStartRatio: number
	forwardWorldDirection: WorldDirection
	observerWorldPosition: WorldPosition
	rightWorldDirection: WorldDirection
	upWorldDirection: WorldDirection
	verticalFovRadians: number
	viewportAspect: number
	viewDistance: number
}>

export type ChunkViewHorizonBounds = KeyedChunkBounds &
	Readonly<{
		distanceFromObserver: number
		fadeProgress: number
	}>

export type ChunkViewHorizon = Readonly<{
	bounds: readonly ChunkViewHorizonBounds[]
	currentChunkCoordinate: ChunkCoordinate
	signature: string
}>

/**
 * Computes all chunk bounds that belong to the current view horizon.
 *
 * The function is intentionally memoryless: it does not diff against a previous
 * frame, cache old chunks, or retain outside chunks. Persistence and streaming
 * lifecycle can be layered above this pure query when a concrete world needs it.
 */
export function createChunkViewHorizon(
	options: ChunkViewHorizonOptions
): ChunkViewHorizon {
	validateChunkViewHorizonOptions(options)

	const currentChunkCoordinate = getChunkCoordinate(
		options.observerWorldPosition,
		options.dimensions
	)
	const context = createChunkViewHorizonContext(options)
	const searchRadius = getSearchChunkRadius({
		dimensions: context.dimensions,
		viewDistance: context.viewDistance
	})
	const candidateBounds = createCandidateChunkBounds({
		context,
		currentChunkCoordinate,
		searchRadius
	})
	const visibleBounds = createVisibleHorizonBoundsList(candidateBounds, context)

	return {
		bounds: visibleBounds,
		currentChunkCoordinate,
		signature: createHorizonSignature({
			context,
			currentChunkCoordinate,
			edgeBufferRadians: options.edgeBufferRadians,
			searchRadius,
			verticalFovRadians: options.verticalFovRadians,
			viewportAspect: options.viewportAspect
		})
	}
}

function createChunkViewHorizonContext(
	options: ChunkViewHorizonOptions
): ChunkViewHorizonContext {
	return {
		chunkRadius: getChunkBoundingRadius(options.dimensions),
		dimensions: options.dimensions,
		expandedFov: getExpandedFov({
			edgeBufferRadians: options.edgeBufferRadians,
			verticalFovRadians: options.verticalFovRadians,
			viewportAspect: options.viewportAspect
		}),
		fadeStartRatio: options.fadeStartRatio,
		observerWorldPosition: options.observerWorldPosition,
		viewBasis: createNormalizedViewBasis(options),
		viewDistance: options.viewDistance
	}
}

function createNormalizedViewBasis({
	forwardWorldDirection,
	rightWorldDirection,
	upWorldDirection
}: ChunkViewHorizonOptions): WorldDirectionBasis {
	return {
		forwardWorldDirection: normalizeDirection(forwardWorldDirection),
		rightWorldDirection: normalizeDirection(rightWorldDirection),
		upWorldDirection: normalizeDirection(upWorldDirection)
	}
}

function validateChunkViewHorizonOptions({
	dimensions,
	edgeBufferRadians,
	fadeStartRatio,
	forwardWorldDirection,
	observerWorldPosition,
	rightWorldDirection,
	upWorldDirection,
	verticalFovRadians,
	viewportAspect,
	viewDistance
}: ChunkViewHorizonOptions): void {
	assertFinitePositiveNumber(viewDistance, 'viewDistance')
	assertFinitePositiveNumber(verticalFovRadians, 'verticalFovRadians')
	assertFinitePositiveNumber(viewportAspect, 'viewportAspect')
	assertFiniteNonNegativeNumber(edgeBufferRadians, 'edgeBufferRadians')
	assertRatio(fadeStartRatio, 'fadeStartRatio')
	assertFinitePosition(observerWorldPosition, 'observerWorldPosition')
	assertFiniteDirection(forwardWorldDirection, 'forwardWorldDirection')
	assertFiniteDirection(rightWorldDirection, 'rightWorldDirection')
	assertFiniteDirection(upWorldDirection, 'upWorldDirection')

	// Detailed dimension validation still belongs to chunk-core. Calling its
	// public helpers during horizon creation keeps one authoritative validator.
	void dimensions
}

function createCandidateChunkBounds({
	context,
	currentChunkCoordinate,
	searchRadius
}: Readonly<{
	context: ChunkViewHorizonContext
	currentChunkCoordinate: ChunkCoordinate
	searchRadius: number
}>): readonly KeyedChunkBounds[] {
	const visibleCandidateCoordinates = createCenteredChunkGridCoordinates({
		coordinateOffset: currentChunkCoordinate,
		counts: {
			xAxisChunkCount: searchRadius * 2 + 1,
			yAxisChunkCount: searchRadius * 2 + 1,
			zAxisChunkCount: searchRadius * 2 + 1
		}
	}).filter((coordinate) => isCoordinateNearExpandedView(coordinate, context))

	return createKeyedChunkBounds({
		coordinates: visibleCandidateCoordinates,
		dimensions: context.dimensions
	})
}

function createVisibleHorizonBoundsList(
	candidateBounds: readonly KeyedChunkBounds[],
	context: ChunkViewHorizonContext
): readonly ChunkViewHorizonBounds[] {
	return candidateBounds
		.map((bounds) => createVisibleHorizonBounds(bounds, context))
		.filter((bounds): bounds is ChunkViewHorizonBounds => bounds !== undefined)
}

function createVisibleHorizonBounds(
	bounds: KeyedChunkBounds,
	context: ChunkViewHorizonContext
): ChunkViewHorizonBounds | undefined {
	const visibleProjection = createVisibleChunkProjection({
		chunkCenter: getBoundsCenter(bounds),
		context,
		fadeStartRatio: context.fadeStartRatio
	})

	if (!visibleProjection) {
		return undefined
	}

	return {
		...bounds,
		distanceFromObserver: visibleProjection.distanceFromObserver,
		fadeProgress: visibleProjection.fadeProgress
	}
}

function isCoordinateNearExpandedView(
	coordinate: ChunkCoordinate,
	context: ChunkViewHorizonContext
): boolean {
	return Boolean(
		createVisibleChunkProjection({
			chunkCenter: getCoordinateCenter(coordinate, context.dimensions),
			context,
			fadeStartRatio: 1
		})
	)
}

function createVisibleChunkProjection({
	chunkCenter,
	context,
	fadeStartRatio
}: Readonly<{
	chunkCenter: WorldPosition
	context: ChunkViewHorizonContext
	fadeStartRatio: number
}>): VisibleChunkProjection | undefined {
	const observerToChunk = subtractPositions(chunkCenter, context.observerWorldPosition)
	const distanceFromObserver = getVectorLength(observerToChunk)

	if (
		isOutsideViewDistance({
			chunkRadius: context.chunkRadius,
			distanceFromObserver,
			viewDistance: context.viewDistance
		})
	) {
		return undefined
	}

	if (distanceFromObserver === 0) {
		return {
			distanceFromObserver,
			fadeProgress: 0
		}
	}

	return createAngledVisibleChunkProjection({
		context,
		distanceFromObserver,
		fadeStartRatio,
		observerToChunk
	})
}

function createAngledVisibleChunkProjection({
	context,
	distanceFromObserver,
	fadeStartRatio,
	observerToChunk
}: Readonly<{
	context: ChunkViewHorizonContext
	distanceFromObserver: number
	fadeStartRatio: number
	observerToChunk: WorldDirection
}>): VisibleChunkProjection | undefined {
	if (isBehindObserverPlane(observerToChunk, context)) {
		return undefined
	}

	const chunkAngularRadius = Math.asin(
		Math.min(1, context.chunkRadius / distanceFromObserver)
	)
	const viewAngles = getViewAngles({
		observerToChunk,
		viewBasis: context.viewBasis
	})

	if (
		!isInsideExpandedFov({
			chunkAngularRadius,
			expandedFov: context.expandedFov,
			viewAngles
		})
	) {
		return undefined
	}

	return {
		distanceFromObserver,
		fadeProgress: getFadeProgress({
			expandedFov: context.expandedFov,
			fadeStartRatio,
			viewAngles,
			viewDistance: context.viewDistance,
			visibleDistance: distanceFromObserver + context.chunkRadius
		})
	}
}

function isOutsideViewDistance({
	chunkRadius,
	distanceFromObserver,
	viewDistance
}: Readonly<{
	chunkRadius: number
	distanceFromObserver: number
	viewDistance: number
}>): boolean {
	return distanceFromObserver - chunkRadius > viewDistance
}

function isBehindObserverPlane(
	observerToChunk: WorldDirection,
	context: ChunkViewHorizonContext
): boolean {
	return (
		getDotProduct(observerToChunk, context.viewBasis.forwardWorldDirection) +
			context.chunkRadius <
		0
	)
}

function getSearchChunkRadius({
	dimensions,
	viewDistance
}: Readonly<{
	dimensions: ChunkDimensions
	viewDistance: number
}>): number {
	return Math.ceil(viewDistance / getSmallestChunkDimension(dimensions)) + 1
}

function getSmallestChunkDimension(dimensions: ChunkDimensions): number {
	return Math.min(dimensions.width, dimensions.height, dimensions.depth)
}

function getChunkBoundingRadius(dimensions: ChunkDimensions): number {
	return (
		Math.sqrt(
			dimensions.width * dimensions.width +
				dimensions.height * dimensions.height +
				dimensions.depth * dimensions.depth
		) / 2
	)
}

function getCoordinateCenter(
	coordinate: ChunkCoordinate,
	dimensions: ChunkDimensions
): WorldPosition {
	return {
		x: coordinate.x * dimensions.width + dimensions.width / 2,
		y: coordinate.y * dimensions.height + dimensions.height / 2,
		z: coordinate.z * dimensions.depth + dimensions.depth / 2
	}
}

function getBoundsCenter(bounds: KeyedChunkBounds): WorldPosition {
	return {
		x: (bounds.min.x + bounds.max.x) / 2,
		y: (bounds.min.y + bounds.max.y) / 2,
		z: (bounds.min.z + bounds.max.z) / 2
	}
}

function subtractPositions(
	position: WorldPosition,
	origin: WorldPosition
): WorldDirection {
	return {
		x: position.x - origin.x,
		y: position.y - origin.y,
		z: position.z - origin.z
	}
}

function normalizeDirection(direction: WorldDirection): WorldDirection {
	const length = getVectorLength(direction)

	if (length === 0) {
		throw new Error('World direction must not be a zero-length vector.')
	}

	return {
		x: direction.x / length,
		y: direction.y / length,
		z: direction.z / length
	}
}

function getVectorLength(vector: WorldDirection): number {
	return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)
}

function getDotProduct(
	firstVector: WorldDirection,
	secondVector: WorldDirection
): number {
	return (
		firstVector.x * secondVector.x +
		firstVector.y * secondVector.y +
		firstVector.z * secondVector.z
	)
}

function getViewAngles({
	observerToChunk,
	viewBasis
}: Readonly<{
	observerToChunk: WorldDirection
	viewBasis: WorldDirectionBasis
}>): ViewAngles {
	const forwardDistance = Math.max(
		getDotProduct(observerToChunk, viewBasis.forwardWorldDirection),
		0.001
	)
	const horizontalDistance = Math.abs(
		getDotProduct(observerToChunk, viewBasis.rightWorldDirection)
	)
	const verticalDistance = Math.abs(
		getDotProduct(observerToChunk, viewBasis.upWorldDirection)
	)

	return {
		horizontalRadians: Math.atan2(horizontalDistance, forwardDistance),
		verticalRadians: Math.atan2(verticalDistance, forwardDistance)
	}
}

function isInsideExpandedFov({
	chunkAngularRadius,
	expandedFov,
	viewAngles
}: Readonly<{
	chunkAngularRadius: number
	expandedFov: ExpandedFov
	viewAngles: ViewAngles
}>): boolean {
	const maxHorizontalAngle = Math.min(
		HALF_TURN_RADIANS,
		expandedFov.horizontalHalfRadians + chunkAngularRadius
	)
	const maxVerticalAngle = Math.min(
		HALF_TURN_RADIANS,
		expandedFov.verticalHalfRadians + chunkAngularRadius
	)

	return (
		viewAngles.horizontalRadians <= maxHorizontalAngle &&
		viewAngles.verticalRadians <= maxVerticalAngle
	)
}

function getExpandedFov({
	edgeBufferRadians,
	verticalFovRadians,
	viewportAspect
}: Readonly<{
	edgeBufferRadians: number
	verticalFovRadians: number
	viewportAspect: number
}>): ExpandedFov {
	const verticalHalfFov = verticalFovRadians / 2
	const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * viewportAspect)

	return {
		horizontalHalfRadians: Math.min(
			HALF_TURN_RADIANS,
			horizontalHalfFov + edgeBufferRadians
		),
		verticalHalfRadians: Math.min(
			HALF_TURN_RADIANS,
			verticalHalfFov + edgeBufferRadians
		)
	}
}

function getFadeProgress({
	expandedFov,
	fadeStartRatio,
	viewAngles,
	viewDistance,
	visibleDistance
}: Readonly<{
	expandedFov: ExpandedFov
	fadeStartRatio: number
	viewAngles: ViewAngles
	viewDistance: number
	visibleDistance: number
}>): number {
	const distanceFade = smoothstep(
		viewDistance * fadeStartRatio,
		viewDistance,
		visibleDistance
	)
	const horizontalEdgeFade = smoothstep(
		expandedFov.horizontalHalfRadians * fadeStartRatio,
		expandedFov.horizontalHalfRadians,
		viewAngles.horizontalRadians
	)
	const verticalEdgeFade = smoothstep(
		expandedFov.verticalHalfRadians * fadeStartRatio,
		expandedFov.verticalHalfRadians,
		viewAngles.verticalRadians
	)

	return Math.max(distanceFade, horizontalEdgeFade, verticalEdgeFade)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) {
		return value < edge0 ? 0 : 1
	}

	const normalizedValue = clamp((value - edge0) / (edge1 - edge0), 0, 1)

	return normalizedValue * normalizedValue * (3 - 2 * normalizedValue)
}

function createHorizonSignature({
	context,
	currentChunkCoordinate,
	edgeBufferRadians,
	searchRadius,
	verticalFovRadians,
	viewportAspect
}: Readonly<{
	context: ChunkViewHorizonContext
	currentChunkCoordinate: ChunkCoordinate
	edgeBufferRadians: number
	searchRadius: number
	verticalFovRadians: number
	viewportAspect: number
}>): string {
	const { observerWorldPosition, viewBasis } = context

	return [
		getChunkKey(currentChunkCoordinate),
		getQuantizedPositionNumber(observerWorldPosition.x),
		getQuantizedPositionNumber(observerWorldPosition.y),
		getQuantizedPositionNumber(observerWorldPosition.z),
		getQuantizedDirectionSignature(viewBasis.forwardWorldDirection),
		getQuantizedDirectionSignature(viewBasis.rightWorldDirection),
		getQuantizedDirectionSignature(viewBasis.upWorldDirection),
		`${context.dimensions.width}:${context.dimensions.height}:${context.dimensions.depth}`,
		getQuantizedNumber(edgeBufferRadians),
		getQuantizedNumber(context.fadeStartRatio),
		searchRadius,
		getQuantizedNumber(verticalFovRadians),
		getQuantizedNumber(viewportAspect),
		getQuantizedNumber(context.viewDistance)
	].join('|')
}

function getQuantizedDirectionSignature(direction: WorldDirection): string {
	return [
		getQuantizedNumber(direction.x),
		getQuantizedNumber(direction.y),
		getQuantizedNumber(direction.z)
	].join(':')
}

function getQuantizedNumber(value: number): number {
	return Math.round(value * HORIZON_SIGNATURE_PRECISION) / HORIZON_SIGNATURE_PRECISION
}

function getQuantizedPositionNumber(value: number): number {
	return (
		Math.round(value * HORIZON_POSITION_SIGNATURE_PRECISION) /
		HORIZON_POSITION_SIGNATURE_PRECISION
	)
}

function assertFinitePosition(position: WorldPosition, name: string): void {
	assertFiniteNumber(position.x, `${name}.x`)
	assertFiniteNumber(position.y, `${name}.y`)
	assertFiniteNumber(position.z, `${name}.z`)
}

function assertFiniteDirection(direction: WorldDirection, name: string): void {
	assertFiniteNumber(direction.x, `${name}.x`)
	assertFiniteNumber(direction.y, `${name}.y`)
	assertFiniteNumber(direction.z, `${name}.z`)

	if (getVectorLength(direction) === 0) {
		throw new Error(`${name} must not be a zero-length vector.`)
	}
}

function assertFinitePositiveNumber(value: number, name: string): void {
	assertFiniteNumber(value, name)

	if (value <= 0) {
		throw new Error(`${name} must be greater than 0.`)
	}
}

function assertFiniteNonNegativeNumber(value: number, name: string): void {
	assertFiniteNumber(value, name)

	if (value < 0) {
		throw new Error(`${name} must be greater than or equal to 0.`)
	}
}

function assertRatio(value: number, name: string): void {
	assertFiniteNumber(value, name)

	if (value < 0 || value > 1) {
		throw new Error(`${name} must be between 0 and 1.`)
	}
}

function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be a finite number.`)
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}
