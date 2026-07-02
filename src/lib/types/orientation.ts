/** ICAROS orientation data — pitch/roll from Device Orientation API */
export interface OrientationData {
	type: "orientation";
	/** Forward/back lean in degrees (-90 to 90) */
	pitch: number;
	/** Left/right lean in degrees (-90 to 90) */
	roll: number;
	/** Optional yaw/heading in degrees, provided by M5 orientation messages */
	yaw?: number;
	/** Optional unscaled M5 pitch in degrees for experiences that need raw data */
	rawPitch?: number;
	/** Optional unscaled M5 roll in degrees for experiences that need raw data */
	rawRoll?: number;
	timestamp: number;
}

/** Speed control commands — accelerate/brake buttons */
export interface SpeedCommand {
	type: "speed";
	action: "accelerate" | "brake";
	active: boolean;
	timestamp: number;
}

/** Runtime settings update from controller sidebar */
export interface SettingsUpdate {
	type: "settings";
	settings: Record<string, number | boolean | string>;
	timestamp: number;
}

/** Runtime settings update for the M5Stick bridge */
export interface M5BridgeSettingsUpdate {
	type: "m5-settings";
	settings: Record<string, number | boolean>;
	timestamp: number;
}

/** All possible controller → VR scene messages */
export type ControllerMessage =
	| OrientationData
	| SpeedCommand
	| SettingsUpdate
	| M5BridgeSettingsUpdate;
