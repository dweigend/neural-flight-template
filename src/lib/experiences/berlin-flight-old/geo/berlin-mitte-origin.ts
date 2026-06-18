import { BERLIN_LOCAL_AXES } from "./axes";
import type { GeoReference, GeographicCoordinate } from "./types";

export const BERLIN_MITTE_ORIGIN: GeographicCoordinate = {
	latitudeDegrees: 52.516275,
	longitudeDegrees: 13.377704,
	heightMeters: 35,
};

export const BERLIN_MITTE_GEO_REFERENCE: GeoReference = {
	origin: BERLIN_MITTE_ORIGIN,
	axes: BERLIN_LOCAL_AXES,
};
