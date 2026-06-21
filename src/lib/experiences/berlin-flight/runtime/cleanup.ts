import * as THREE from "three";

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

export function disposeObjectTree(root: THREE.Object3D | null): void {
  if (!root) return;

  root.traverse((object) => {
    const disposable = object as DisposableObject;

    disposable.geometry?.dispose();
    if (!disposable.material) return;

    disposeMaterial(disposable.material);
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      entry.dispose();
    }
    return;
  }

  material.dispose();
}
