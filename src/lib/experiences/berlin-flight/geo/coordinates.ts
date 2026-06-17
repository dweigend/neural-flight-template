import { BERLIN_MITTE_GEO_REFERENCE } from "./berlin-mitte-origin";
import type { GeoReference, GeographicCoordinate, LocalCoordinate } from "./types";

const EARTH_RADIUS_METERS = 6378137;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function degreesToRadians(degrees: number): number {
	return degrees * DEGREES_TO_RADIANS;
}

function radiansToDegrees(radians: number): number {
	return radians * RADIANS_TO_DEGREES;
}

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
}

export function isFiniteGeographicCoordinate(
	coordinate: GeographicCoordinate,
): boolean {
	if (!isFiniteNumber(coordinate.latitudeDegrees)) return false;
	if (!isFiniteNumber(coordinate.longitudeDegrees)) return false;
	return isFiniteNumber(coordinate.heightMeters);
}

export function isFiniteLocalCoordinate(coordinate: LocalCoordinate): boolean {
	if (!isFiniteNumber(coordinate.xMeters)) return false;
	if (!isFiniteNumber(coordinate.yMeters)) return false;
	return isFiniteNumber(coordinate.zMeters);
}

export function geographicToLocalMeters(
	coordinate: GeographicCoordinate,
	reference: GeoReference = BERLIN_MITTE_GEO_REFERENCE,
): LocalCoordinate {
	if (!isFiniteGeographicCoordinate(coordinate)) return zeroLocalCoordinate();
	if (!isFiniteGeographicCoordinate(reference.origin)) return zeroLocalCoordinate();

	const originLatRadians = degreesToRadians(reference.origin.latitudeDegrees);
	const deltaLatRadians = degreesToRadians(
		coordinate.latitudeDegrees - reference.origin.latitudeDegrees,
	);
	const deltaLonRadians = degreesToRadians(
		coordinate.longitudeDegrees - reference.origin.longitudeDegrees,
	);

	const eastMeters = deltaLonRadians * Math.cos(originLatRadians) * EARTH_RADIUS_METERS;
	const northMeters = deltaLatRadians * EARTH_RADIUS_METERS;

	return {
		xMeters: eastMeters,
		yMeters: coordinate.heightMeters - reference.origin.heightMeters,
		zMeters: -northMeters,
	};
}

export function localMetersToGeographic(
	coordinate: LocalCoordinate,
	reference: GeoReference = BERLIN_MITTE_GEO_REFERENCE,
): GeographicCoordinate {
	if (!isFiniteLocalCoordinate(coordinate)) return reference.origin;
	if (!isFiniteGeographicCoordinate(reference.origin)) return zeroGeographicCoordinate();

	const originLatRadians = degreesToRadians(reference.origin.latitudeDegrees);
	const northMeters = -coordinate.zMeters;
	const deltaLatRadians = northMeters / EARTH_RADIUS_METERS;
	const metersPerLonRadian = Math.cos(originLatRadians) * EARTH_RADIUS_METERS;
	if (metersPerLonRadian === 0) return reference.origin;

	const deltaLonRadians = coordinate.xMeters / metersPerLonRadian;

	return {
		latitudeDegrees:
			reference.origin.latitudeDegrees + radiansToDegrees(deltaLatRadians),
		longitudeDegrees:
			reference.origin.longitudeDegrees + radiansToDegrees(deltaLonRadians),
		heightMeters: reference.origin.heightMeters + coordinate.yMeters,
	};
}

export function horizontalDistanceMeters(a: LocalCoordinate, b: LocalCoordinate): number {
	if (!isFiniteLocalCoordinate(a)) return 0;
	if (!isFiniteLocalCoordinate(b)) return 0;

	const dx = a.xMeters - b.xMeters;
	const dz = a.zMeters - b.zMeters;
	return Math.hypot(dx, dz);
}

export function zeroLocalCoordinate(): LocalCoordinate {
	return { xMeters: 0, yMeters: 0, zMeters: 0 };
}

export function zeroGeographicCoordinate(): GeographicCoordinate {
	return { latitudeDegrees: 0, longitudeDegrees: 0, heightMeters: 0 };
}
