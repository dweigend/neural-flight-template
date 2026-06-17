import * as THREE from "three";
import type { GeoReference, LocalCoordinate } from "../geo";
import { BERLIN_MITTE_GEO_REFERENCE } from "../geo";
import { BERLIN_TILE_RUNTIME } from "../constants";

export type TilesRuntimeStatus =
	| "idle"
	| "loading"
	| "ready"
	| "error"
	| "disposed";

export interface TilesRuntimeSource {
	url: string;
	accessToken?: string;
	attribution?: string;
}

export interface TilesRuntimeStats {
	status: TilesRuntimeStatus;
	loadedTileCount: number;
	visibleTileCount: number;
	lastErrorMessage: string | null;
}

export interface TilesRuntimeFrameContext {
	camera: THREE.PerspectiveCamera;
	deltaSeconds: number;
	originOffsetMeters: LocalCoordinate;
}

export interface TilesRuntimeAdapter {
	readonly id: string;
	readonly root: THREE.Group;
	readonly geoReference: GeoReference;
	readonly stats: TilesRuntimeStats;
	load(source: TilesRuntimeSource): Promise<void>;
	update(ctx: TilesRuntimeFrameContext): void;
	setVisible(visible: boolean): void;
	dispose(): void;
}

function createInitialStats(): TilesRuntimeStats {
	return {
		status: "idle",
		loadedTileCount: 0,
		visibleTileCount: 0,
		lastErrorMessage: null,
	};
}

export function createTilesRuntimeAdapter(
	geoReference: GeoReference = BERLIN_MITTE_GEO_REFERENCE,
): TilesRuntimeAdapter {
	return new PlaceholderTilesRuntimeAdapter(geoReference);
}

class PlaceholderTilesRuntimeAdapter implements TilesRuntimeAdapter {
	readonly id = BERLIN_TILE_RUNTIME.id;
	readonly root = new THREE.Group();
	readonly geoReference: GeoReference;
	readonly stats = createInitialStats();
	#isDisposed = false;

	constructor(geoReference: GeoReference) {
		this.geoReference = geoReference;
		this.root.name = "berlin-tiles-runtime-root";
		this.root.visible = false;
	}

	async load(source: TilesRuntimeSource): Promise<void> {
		if (this.#isDisposed) return;
		if (!source.url) {
			this.stats.status = "error";
			this.stats.lastErrorMessage = "Tiles source URL is required.";
			return;
		}

		this.stats.status = "idle";
		this.stats.lastErrorMessage = null;
	}

	update(ctx: TilesRuntimeFrameContext): void {
		if (this.#isDisposed) return;
		if (!this.root.visible) return;
		if (!Number.isFinite(ctx.deltaSeconds)) return;
	}

	setVisible(visible: boolean): void {
		if (this.#isDisposed) return;
		this.root.visible = visible;
	}

	dispose(): void {
		if (this.#isDisposed) return;

		this.#isDisposed = true;
		this.stats.status = "disposed";
		this.stats.loadedTileCount = 0;
		this.stats.visibleTileCount = 0;
		this.root.clear();
		this.root.removeFromParent();
	}
}
