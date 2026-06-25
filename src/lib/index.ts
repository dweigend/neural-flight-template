// Three.js

// Flow (Svelte Flow diagrams)
export {
	createArchitectureEdges,
	createArchitectureNodes,
} from "./flow/architecture";
export { FLOW_EDITOR_PROPS, FLOW_READONLY_PROPS } from "./flow/config";
export type { ArchitectureNodeData, NodeClass } from "./flow/types";
// Gyro
export type { CalibrationOffset } from "./gyro/calibration";
export {
	applyCalibration,
	clearCalibration,
	loadCalibration,
	saveCalibration,
} from "./gyro/calibration";
export type { GyroState, GyroStatus } from "./gyro/orientation.svelte";
export { createGyroClient } from "./gyro/orientation.svelte";
export {
	disconnectBridge,
	getBridgeStatus,
	initBridge,
	sendSettings,
} from "./node-editor/bridge";
export {
	getAllNodeTypes,
	getNodeType,
	registerNodeType,
	SignalGraph,
	signalGraph,
} from "./node-editor/graph/engine";
// Node Editor
export type {
	ComputeResult,
	SignalDef,
	SignalEdge,
	SignalNodeInstance,
	SignalPort,
	SignalValue,
} from "./node-editor/graph/types";
export { clampSignal, lerp, remap } from "./node-editor/graph/types";
export type { ParameterPreset } from "./node-editor/parameters/registry";
export {
	getPreset,
	listPresets,
	PARAMETER_PRESETS,
} from "./node-editor/parameters/registry";
export { createClouds } from "./three/clouds";
export { loadGLTF } from "./three/loader";
export { FlightPlayer } from "./three/player";
export type { ChunkRings, RingState } from "./three/rings";
export { createChunkRings, updateRings } from "./three/rings";
export { createFlightScene } from "./three/scene";
export { createSky } from "./three/sky";
export { TerrainChunk } from "./three/terrain/chunk";
export type { ChunkDecorations } from "./three/terrain/decorations";
export { createChunkDecorations } from "./three/terrain/decorations";
export { createTerrainGeometry } from "./three/terrain/geometry";
export type { HeightmapConfig } from "./three/terrain/heightmap";
export { DEFAULT_HEIGHTMAP, getHeight } from "./three/terrain/heightmap";
export { TerrainManager } from "./three/terrain/manager";
export { createWater } from "./three/terrain/water";
export type {
	ControllerMessage,
	OrientationData,
	SpeedCommand,
} from "./types/orientation";
export type {
	ConnectionStatus,
	WebSocketClientOptions,
} from "./types/websocket";
// Client
export { createIcarosHostControlClient } from "./ws/icaros-host-control-client";
export { createWebSocketClient } from "./ws/client.svelte";
