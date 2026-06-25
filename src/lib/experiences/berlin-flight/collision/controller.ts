import { BERLIN_COLLISION } from "../constants";
import { collectOverlappingConesForMesh } from "./cone-query";
import type { BerlinConeVolume } from "./types";
import type { TrackedTileMesh } from "./tile-mesh-types";
import { writeVertexColorsForMesh } from "./vertex-color-writer";
import { updateVertexMask } from "./vertex-mask";

export interface BerlinCollisionDebugStats {
  activeCones: number;
  trackedMeshes: number;
  dirtyMeshes: number;
  processedMeshesLastTick: number;
  verticesTestedLastTick: number;
}

export class BerlinCollisionController {
  private readonly dirtyMeshes = new Set<TrackedTileMesh>();
  private readonly trackedMeshes = new Set<TrackedTileMesh>();
  private dirtyQueue: TrackedTileMesh[] = [];
  private lastConeVersion = -1;
  private lastMeshVersion = -1;
  private activeCones = 0;
  private trackedMeshCount = 0;
  private processedMeshesLastTick = 0;
  private verticesTestedLastTick = 0;

  public update(
    cones: readonly BerlinConeVolume[],
    coneVersion: number,
    meshes: readonly TrackedTileMesh[],
    meshVersion: number,
  ): void {
    this.activeCones = cones.length;
    this.syncTrackedMeshes(meshes, meshVersion);

    if (this.lastConeVersion !== coneVersion) {
      this.lastConeVersion = coneVersion;
      this.markMeshesDirty(meshes);
    }

    this.processDirtyMeshes(cones);
  }

  public writeDebugStats(target: BerlinCollisionDebugStats): void {
    target.activeCones = this.activeCones;
    target.trackedMeshes = this.trackedMeshCount;
    target.dirtyMeshes = this.dirtyQueue.length;
    target.processedMeshesLastTick = this.processedMeshesLastTick;
    target.verticesTestedLastTick = this.verticesTestedLastTick;
  }

  private syncTrackedMeshes(
    meshes: readonly TrackedTileMesh[],
    meshVersion: number,
  ): void {
    this.trackedMeshCount = meshes.length;
    if (this.lastMeshVersion === meshVersion) return;

    this.lastMeshVersion = meshVersion;
    const nextTrackedMeshes = new Set(meshes);

    this.trackedMeshes.clear();
    for (const mesh of meshes) {
      this.trackedMeshes.add(mesh);
      this.enqueueDirtyMesh(mesh);
    }

    this.dirtyQueue = this.dirtyQueue.filter((mesh) => nextTrackedMeshes.has(mesh));
    for (const mesh of Array.from(this.dirtyMeshes)) {
      if (nextTrackedMeshes.has(mesh)) continue;
      this.dirtyMeshes.delete(mesh);
    }
  }

  private markMeshesDirty(meshes: readonly TrackedTileMesh[]): void {
    for (const mesh of meshes) {
      this.enqueueDirtyMesh(mesh);
    }
  }

  private enqueueDirtyMesh(mesh: TrackedTileMesh): void {
    if (!this.trackedMeshes.has(mesh) && this.lastMeshVersion !== -1) return;
    if (this.dirtyMeshes.has(mesh)) return;

    this.dirtyMeshes.add(mesh);
    this.dirtyQueue.push(mesh);
  }

  private processDirtyMeshes(cones: readonly BerlinConeVolume[]): void {
    this.processedMeshesLastTick = 0;
    this.verticesTestedLastTick = 0;

    const meshBudget = BERLIN_COLLISION.MAX_MESHES_PER_TICK;

    while (
      this.processedMeshesLastTick < meshBudget &&
      this.dirtyQueue.length > 0
    ) {
      const mesh = this.dirtyQueue.shift();
      if (!mesh) break;
      if (!this.dirtyMeshes.has(mesh)) continue;
      if (!this.trackedMeshes.has(mesh)) {
        this.dirtyMeshes.delete(mesh);
        continue;
      }

      const overlappingCones = collectOverlappingConesForMesh(cones, mesh);
      updateVertexMask(mesh, overlappingCones);
      writeVertexColorsForMesh(mesh);

      this.verticesTestedLastTick += mesh.vertexCount;
      this.processedMeshesLastTick += 1;
      this.dirtyMeshes.delete(mesh);
    }
  }
}
