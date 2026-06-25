import * as THREE from "three";

export interface RoadNode {
  id: string;
  position: THREE.Vector3;
  connections: string[];
}

export interface RoadEdge {
  from: string;
  to: string;
}

export interface RoadGraph {
  nodes: Map<string, RoadNode>;
  edges: RoadEdge[];
}
