import { TilesRenderer } from "3d-tiles-renderer";
import type { Camera, WebGLRenderer, Group } from "three";

/**
 * Adapter for the 3D Tiles runtime.
 * This isolates the specific loader (3d-tiles-renderer) from the experience logic.
 */
export class TilesRuntimeAdapter {
	private renderer: TilesRenderer | null = null;
	private url: string;

	constructor(url: string) {
		this.url = url;
	}

	/**
	 * Initializes and loads the tileset.
	 */
	public async loadTiles(group: Group): Promise<TilesRenderer> {
		if (this.renderer) {
			return this.renderer;
		}

		try {
			this.renderer = new TilesRenderer(this.url);

			// Add the tileset to the provided group
			group.add(this.renderer.group);

			// Basic configuration
			this.renderer.errorTarget = 6; // Balance between quality and performance

			console.log("[BerlinFlight] 3D Tiles renderer initialized for:", this.url);
			return this.renderer;
		} catch (error) {
			console.error("[BerlinFlight] Failed to initialize 3D Tiles renderer:", error);
			throw error;
		}
	}

	/**
	 * Updates the tileset every frame.
	 */
	public update(camera: Camera, webglRenderer: WebGLRenderer): void {
		if (!this.renderer) return;

		this.renderer.setCamera(camera);
		this.renderer.setResolutionFromRenderer(camera, webglRenderer);
		this.renderer.update();
	}

	/**
	 * Cleans up resources.
	 */
	public dispose(): void {
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer = null;
		}
	}

	/**
	 * Returns the underlying renderer instance.
	 */
	public getRenderer(): TilesRenderer | null {
		return this.renderer;
	}
}

/**
 * Factory function to create a tiles runtime.
 */
export function createTilesRuntime(url: string): TilesRuntimeAdapter {
	return new TilesRuntimeAdapter(url);
}
