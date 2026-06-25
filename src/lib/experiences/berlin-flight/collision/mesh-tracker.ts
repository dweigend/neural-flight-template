import * as THREE from "three";
import {
  createBerlinTileMaterial,
  disposeMaterial,
} from "../runtime/tiles-material";
import type { BerlinTileMesh, TrackedTileMesh } from "./tile-mesh-types";
import { preprocessTrackedMesh } from "./mesh-preprocess";

export class BerlinTileMeshRegistry {
  private readonly trackedByScene = new Map<THREE.Object3D, readonly TrackedTileMesh[]>();
  private readonly trackedMeshes = new Set<TrackedTileMesh>();
  private version = 0;

  public trackTileScene(root: THREE.Object3D): void {
    if (this.trackedByScene.has(root)) return;

    const trackedMeshes = collectTrackedMeshes(root);
    this.trackedByScene.set(root, trackedMeshes);

    for (const trackedMesh of trackedMeshes) {
      this.trackedMeshes.add(trackedMesh);
    }

    this.version += 1;
  }

  public untrackTileScene(root: THREE.Object3D): void {
    const trackedMeshes = this.trackedByScene.get(root);
    if (!trackedMeshes) return;

    const disposedMaterials = new WeakSet<THREE.Material>();

    for (const trackedMesh of trackedMeshes) {
      this.trackedMeshes.delete(trackedMesh);
      disposeMaterial(trackedMesh.debugMaterial, disposedMaterials);
      trackedMesh.colorAttribute = null;
    }

    this.trackedByScene.delete(root);
    this.version += 1;
  }

  public getTrackedTileMeshes(): readonly TrackedTileMesh[] {
    return Array.from(this.trackedMeshes);
  }

  public getTrackedMeshCount(): number {
    return this.trackedMeshes.size;
  }

  public getVersion(): number {
    return this.version;
  }

  public dispose(): void {
    for (const root of this.trackedByScene.keys()) {
      this.untrackTileScene(root);
    }
  }
}

function collectTrackedMeshes(root: THREE.Object3D): readonly TrackedTileMesh[] {
  const trackedMeshes: TrackedTileMesh[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!(child.geometry instanceof THREE.BufferGeometry)) return;

    const trackedMesh = createTrackedMesh(child as BerlinTileMesh);
    if (!trackedMesh) return;

    trackedMeshes.push(trackedMesh);
  });

  return trackedMeshes;
}

function createTrackedMesh(mesh: BerlinTileMesh): TrackedTileMesh | null {
  const debugMaterial = createBerlinTileMaterial();
  const trackedMesh = preprocessTrackedMesh(mesh, debugMaterial);

  if (trackedMesh) return trackedMesh;

  disposeMaterial(debugMaterial);
  return null;
}
