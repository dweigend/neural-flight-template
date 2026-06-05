import * as THREE from "three";
import type { RoadGraph } from "./road-network-types";
import { ROADS } from "./road-config";

export function renderRoadNetwork(graph: RoadGraph, roadGroup: THREE.Group): void {
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const start = fromNode.position;
    const end = toNode.position;
    const direction = new THREE.Vector3().copy(end).sub(start);
    const length = direction.length();
    if (length < 0.01) continue;

    const mid = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);

    const roadGeo = new THREE.BoxGeometry(ROADS.ROAD_WIDTH, 0.3, length);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.9,
      metalness: 0.1,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.copy(mid);
    roadMesh.position.y = ROADS.ROAD_Y_OFFSET;

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    roadMesh.quaternion.copy(quat);

    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);
  }

  const segments = Math.floor(ROADS.ROAD_WIDTH / ROADS.LANE_MARKER_STEP);
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const start = fromNode.position;
    const end = toNode.position;
    const direction = new THREE.Vector3().copy(end).sub(start);
    const length = direction.length();
    if (length < 0.01) continue;

    const mid = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());

    for (let i = 0; i < ROADS.LANE_MARKER_STEP; i++) {
      const t = (i + 0.5) / ROADS.LANE_MARKER_STEP;
      const markerPos = new THREE.Vector3().lerpVectors(start, end, t);
      markerPos.y = ROADS.ROAD_Y_OFFSET + 0.16;

      const markerGeo = new THREE.BoxGeometry(0.2, 0.05, 1.2);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(markerPos);
      marker.quaternion.copy(quat);
      roadGroup.add(marker);
    }
  }
}

export function disposeRoadNetwork(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        for (const m of child.material) m.dispose();
      } else {
        child.material.dispose();
      }
    }
  });
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}
