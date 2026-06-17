export interface GeographicCoordinate {
	latitudeDegrees: number;
	longitudeDegrees: number;
	heightMeters: number;
}

export interface LocalCoordinate {
	xMeters: number;
	yMeters: number;
	zMeters: number;
}

export interface LocalAxisConventions {
	x: "east";
	y: "up";
	z: "south";
	units: "meters";
	handedness: "right-handed";
}

export interface GeoReference {
	origin: GeographicCoordinate;
	axes: LocalAxisConventions;
}
