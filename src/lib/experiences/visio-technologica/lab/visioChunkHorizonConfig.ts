import type { ChunkDimensions } from "$lib/experiences/visio-technologica/chunk-core";

export const VISIO_HORIZON_CHUNK_DIMENSIONS: ChunkDimensions = {
  depth: 16,
  height: 16,
  width: 16,
};

export const VISIO_HORIZON_INITIAL_CAMERA_POSITION = {
  x: 0,
  y: 12,
  z: 24,
} as const;

export const VISIO_HORIZON_INITIAL_PITCH_RADIANS = 0;
export const VISIO_HORIZON_INITIAL_YAW_RADIANS = Math.PI;
export const VISIO_HORIZON_MAX_FRAME_DELTA_SECONDS = 0.08;
export const VISIO_HORIZON_MAX_PITCH_RADIANS = Math.PI / 2 - 0.02;
export const VISIO_HORIZON_MOVE_SPEED = 20;
export const VISIO_HORIZON_LOOK_SENSITIVITY = 0.0022;
export const VISIO_HORIZON_VIEW_DISTANCE = 160;
export const VISIO_HORIZON_EDGE_BUFFER_RADIANS = Math.PI / 12;
export const VISIO_HORIZON_FADE_START_RATIO = 0.68;
export const VISIO_HORIZON_GRID_EXTENT = 24;
export const VISIO_HORIZON_BACKGROUND_COLOR = 0x04070d;
export const VISIO_HORIZON_NEAR_COLOR = 0x67e8f9;
export const VISIO_HORIZON_FAR_COLOR = 0x1e293b;
