import * as THREE from "three";

export function disposeObjectTree(root: THREE.Object3D | null): void {
  if (!root) return;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.geometry.dispose();
    disposeMaterial(object.material);
  });
}

export function removeFromParent(object: THREE.Object3D | null): void {
  if (!object) return;

  object.removeFromParent();
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
