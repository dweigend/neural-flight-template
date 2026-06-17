import * as THREE from "three";
import { CAMERA, CLOUDS, FLIGHT, SKY, TERRAIN } from "$lib/config/flight";
import { createClouds, disposeClouds, updateClouds } from "$lib/three/clouds";
import { FlightPlayer } from "$lib/three/player";
import { createSky } from "$lib/three/sky";
import { TerrainManager } from "$lib/three/terrain/manager";
import { createWater } from "$lib/three/terrain/water";
import type { ExperienceState, SetupContext, TickContext } from "../types";

export interface MountainFlightState extends ExperienceState {
  player: FlightPlayer;
  terrain: TerrainManager;
  water: THREE.Mesh;
  skyMesh: THREE.Mesh;
  clouds: THREE.Group;
  score: number;
  cloudRebuildTimer: ReturnType<typeof setTimeout> | null;
  camera: THREE.PerspectiveCamera;
  /** Wind speed for cloud drift — updated via applySettings */
  windSpeed: number;
  /** Whether clouds drift with wind — updated via applySettings */
  cloudDriftEnabled: boolean;
}

export async function setup(ctx: SetupContext): Promise<MountainFlightState> {
  // Player (creates own camera + rig)
  const player = new FlightPlayer({
    fov: CAMERA.FOV,
    near: CAMERA.NEAR,
    far: CAMERA.FAR,
    spawnPosition: FLIGHT.SPAWN_POSITION,
    baseSpeed: FLIGHT.BASE_SPEED,
    terrainSlowdown: FLIGHT.TERRAIN_SLOWDOWN,
  });
  ctx.scene.add(player.rig);

  // The Loader adds a DirectionalLight from manifest.scene — find it to configure shadows.
  // Shadow camera frustum (150×150, near 0.5, far 500) defines the area that casts shadows.
  // 1024×1024 shadow map balances quality vs Quest GPU budget.
  const sun = ctx.scene.children.find(
    (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
  );
  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
  }

  // Terrain
  const terrain = new TerrainManager({
    chunkSize: TERRAIN.CHUNK_SIZE,
    maxPool: TERRAIN.MAX_POOL,
  });
  ctx.scene.add(terrain.group);
  ctx.scene.add(terrain.ringGroup);
  terrain.update(player.rig.position);

  // Water
  const water = createWater({
    size: TERRAIN.WATER_SIZE,
    color: TERRAIN.WATER_COLOR,
    opacity: TERRAIN.WATER_OPACITY,
    y: TERRAIN.WATER_Y,
  });
  ctx.scene.add(water);

  // Sky
  const skyMesh = createSky({
    radius: SKY.RADIUS,
    detail: SKY.DETAIL,
    colorTop: SKY.COLOR_TOP,
    colorHorizon: SKY.COLOR_HORIZON,
    colorBottom: SKY.COLOR_BOTTOM,
  });
  ctx.scene.add(skyMesh);

  // Clouds
  const clouds = createClouds({
    count: CLOUDS.COUNT,
    spread: CLOUDS.SPREAD,
    heightMin: CLOUDS.HEIGHT_MIN,
    heightMax: CLOUDS.HEIGHT_MAX,
    blobCount: CLOUDS.BLOB_COUNT,
    blobRadius: CLOUDS.BLOB_RADIUS,
    color: CLOUDS.COLOR,
    opacity: CLOUDS.OPACITY,
    driftSpeed: CLOUDS.DRIFT_SPEED,
    driftDirection: CLOUDS.DRIFT_DIRECTION,
  });
  ctx.scene.add(clouds);

  return {
    player,
    terrain,
    water,
    skyMesh,
    clouds,
    score: 0,
    cloudRebuildTimer: null,
    // FlightPlayer owns its own camera (attached to rig) — expose it so the
    // Loader can use it as the active rendering camera for this experience.
    camera: player.camera,
    windSpeed: CLOUDS.DRIFT_SPEED,
    cloudDriftEnabled: true,
  };
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState; outputs?: Record<string, number> } {
  const s = state as MountainFlightState;

  s.player.tick(ctx.delta);

  if (s.cloudDriftEnabled) {
    updateClouds(s.clouds, ctx.delta, s.player.rig.position, s.windSpeed);
  }

  s.score += s.terrain.update(s.player.rig.position);

  return { state: s, outputs: { score: s.score } };
}

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
  const s = state as MountainFlightState;

  if (s.cloudRebuildTimer) clearTimeout(s.cloudRebuildTimer);

  s.terrain.dispose();
  disposeClouds(s.clouds);

  scene.remove(s.water);
  scene.remove(s.skyMesh);
  scene.remove(s.clouds);
  scene.remove(s.player.rig);
  scene.remove(s.terrain.group);
  scene.remove(s.terrain.ringGroup);
}
