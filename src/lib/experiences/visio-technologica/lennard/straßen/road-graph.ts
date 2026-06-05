import * as THREE from "three";
import type { RoadGraph, RoadNode, RoadEdge } from "./road-network-types";

export interface TileCenter {
  x: number;
  y: number;
}

export interface TileInfo {
  id: string;
  center: TileCenter;
  worldPosition: THREE.Vector3;
}

function gridKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function buildRoadGraph(tiles: TileInfo[]): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const edges: RoadEdge[] = [];

  const grid = new Map<string, string>();

  for (const tile of tiles) {
    const key = gridKey(tile.center.x, tile.center.y);
    grid.set(key, tile.id);
    nodes.set(tile.id, {
      id: tile.id,
      position: tile.worldPosition.clone(),
      connections: [],
    });
  }

  for (const tile of tiles) {
    const node = nodes.get(tile.id);
    if (!node) continue;

    const neighbors: TileCenter[] = [
      { x: tile.center.x + 1, y: tile.center.y },
      { x: tile.center.x - 1, y: tile.center.y },
      { x: tile.center.x, y: tile.center.y + 1 },
      { x: tile.center.x, y: tile.center.y - 1 },
    ];

    for (const n of neighbors) {
      const neighborId = grid.get(gridKey(n.x, n.y));
      if (!neighborId) continue;

      if (node.connections.includes(neighborId)) continue;

      node.connections.push(neighborId);
      const neighborNode = nodes.get(neighborId);
      if (neighborNode) {
        neighborNode.connections.push(tile.id);
      }

      edges.push({ from: tile.id, to: neighborId });
    }
  }

  return { nodes, edges };
}
