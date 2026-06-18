import * as THREE from "three";
import { FlightPlayer } from "$lib/three/player";
import { BERLIN_CAMERA, BERLIN_SPAWN } from "../constants";
import {
  createStatusIndicator,
  disposeStatusIndicator,
  updateStatusIndicator,
} from "../debug/status-indicator";
import type { BerlinFlightState, BerlinTilesLoadState } from "../types";

export interface CameraRig {
  readonly player: FlightPlayer;
  readonly camera: THREE.PerspectiveCamera;
  readonly root: THREE.Group;
  update(delta: number, tilesLoad: BerlinTilesLoadState): void;
  handleKeyboard(event: KeyboardEvent): void;
  dispose(): void;
}

export function createBerlinCameraRig(baseSpeed: number): CameraRig {
  const player = new FlightPlayer({
    fov: BERLIN_CAMERA.fov,
    near: BERLIN_CAMERA.near,
    far: BERLIN_CAMERA.far,
    spawnPosition: BERLIN_SPAWN.position,
    baseSpeed,
  });

  // Disable terrain clamping for Berlin by setting minClearance very low,
  // since we don't use the standard heightmap here.
  player.minClearance = -1000;

  const statusIndicator = createStatusIndicator();
  player.camera.add(statusIndicator.group);

  return {
    player,
    camera: player.camera,
    root: player.rig,
    update(delta: number, tilesLoad: BerlinTilesLoadState) {
      player.tick(delta);
      updateStatusIndicator(statusIndicator, tilesLoad);
    },
    handleKeyboard(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "w") {
        player.updateSpeed({
          type: "speed",
          action: "accelerate",
          active: event.type === "keydown",
          timestamp: Date.now(),
        });
      }
      if (key === "s") {
        player.updateSpeed({
          type: "speed",
          action: "brake",
          active: event.type === "keydown",
          timestamp: Date.now(),
        });
      }
      // Simple pitch/roll for debugging
      if (key === "arrowup") {
        player.updateOrientation({
          type: "orientation",
          pitch: event.type === "keydown" ? -20 : 0,
          roll: 0,
          timestamp: Date.now(),
        });
      }
      if (key === "arrowdown") {
        player.updateOrientation({
          type: "orientation",
          pitch: event.type === "keydown" ? 20 : 0,
          roll: 0,
          timestamp: Date.now(),
        });
      }
      if (key === "arrowleft") {
        player.updateOrientation({
          type: "orientation",
          pitch: 0,
          roll: event.type === "keydown" ? -30 : 0,
          timestamp: Date.now(),
        });
      }
      if (key === "arrowright") {
        player.updateOrientation({
          type: "orientation",
          pitch: 0,
          roll: event.type === "keydown" ? 30 : 0,
          timestamp: Date.now(),
        });
      }
    },
    dispose() {
      disposeStatusIndicator(statusIndicator);
      player.rig.removeFromParent();
    },
  };
}
