import * as THREE from "three";
import {
  createBerlinTileMaterial,
  disposeClonedMaterial,
  disposeMaterial,
} from "../runtime/tiles-material";
import type { BerlinTileMesh, TrackedTileMesh } from "./tile-mesh-types";
import { preprocessTrackedMesh } from "./mesh-preprocess";
import { initializeConeMaskAttributeForMesh } from "./vertex-color-writer";

export class BerlinTileMeshRegistry {
  private readonly trackedByScene = new Map<THREE.Object3D, readonly TrackedTileMesh[]>();
  private readonly trackedMeshes = new Set<TrackedTileMesh>();
  private version = 0;

  public trackTileScene(root: THREE.Object3D, sourceUrl: string): void {
    if (this.trackedByScene.has(root)) return;

    const trackedMeshes = collectTrackedMeshes(root, sourceUrl);
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
      disposeClonedMaterial(trackedMesh.collisionMaterial, disposedMaterials);
      disposeMaterial(trackedMesh.originalMaterial, disposedMaterials);
      trackedMesh.coneMaskAttribute = null;
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

function collectTrackedMeshes(
  root: THREE.Object3D,
  sourceUrl: string,
): readonly TrackedTileMesh[] {
  const trackedMeshes: TrackedTileMesh[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!(child.geometry instanceof THREE.BufferGeometry)) return;

    const trackedMesh = createTrackedMesh(child as BerlinTileMesh, sourceUrl);
    if (!trackedMesh) return;

    trackedMeshes.push(trackedMesh);
  });

  return trackedMeshes;
}

function createTrackedMesh(
  mesh: BerlinTileMesh,
  sourceUrl: string,
): TrackedTileMesh | null {
  const collisionMaterial = createBerlinTileMaterial(mesh.material);
  const trackedMesh = preprocessTrackedMesh(mesh, collisionMaterial);

  if (trackedMesh) {
    initializeConeMaskAttributeForMesh(trackedMesh);
    trackedMesh.sourceUrl = sourceUrl;
    trackedMesh.mesh.material = collisionMaterial;
    return trackedMesh;
  }

  disposeClonedMaterial(collisionMaterial);
  return null;
}
