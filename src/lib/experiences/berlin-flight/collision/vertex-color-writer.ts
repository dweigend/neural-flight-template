import * as THREE from "three";
import { BERLIN_TILE_LOOK } from "../constants";
import type { TrackedTileMesh } from "./tile-mesh-types";

const NEUTRAL_COLOR = new THREE.Color(BERLIN_TILE_LOOK.NEUTRAL_COLOR);
const COVERED_COLOR = new THREE.Color(BERLIN_TILE_LOOK.COVERED_COLOR);

export function writeVertexColorsForMesh(mesh: TrackedTileMesh): void {
  ensureColorAttribute(mesh);
  writeMeshColors(mesh);
}

function ensureColorAttribute(mesh: TrackedTileMesh): void {
  const existingColorAttribute = mesh.geometry.getAttribute("color");
  if (existingColorAttribute instanceof THREE.BufferAttribute) {
    mesh.colorAttribute = existingColorAttribute;
    return;
  }

  const colors = new Float32Array(mesh.vertexCount * 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  mesh.geometry.setAttribute("color", colorAttribute);
  mesh.colorAttribute = colorAttribute;
}

function writeMeshColors(mesh: TrackedTileMesh): void {
  const colorAttribute = mesh.colorAttribute;
  if (!colorAttribute) return;

  const colors = colorAttribute.array;
  if (!(colors instanceof Float32Array)) return;

  for (let vertexIndex = 0; vertexIndex < mesh.vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    const color =
      mesh.vertexMask[vertexIndex] === 1 ? COVERED_COLOR : NEUTRAL_COLOR;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  colorAttribute.needsUpdate = true;
}
