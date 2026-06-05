import * as THREE from "three";
import type { RoadGraph } from "./road-network-types";
import { ROADS } from "./road-config";

export interface Car {
  mesh: THREE.Group;
  currentNodeId: string;
  targetNodeId: string;
  progress: number;
  speed: number;
  color: number;
}

export function createCarMesh(color: number = 0xff0000): THREE.Group {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(1.5, 0.6, 3);
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.6,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  const cabinGeo = new THREE.BoxGeometry(1.2, 0.4, 1.6);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x222244,
    roughness: 0.1,
    metalness: 0.8,
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.7, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  const wheelPositions = [
    { x: -0.7, z: 1.0 },
    { x: 0.7, z: 1.0 },
    { x: -0.7, z: -1.0 },
    { x: 0.7, z: -1.0 },
  ];
  for (const wp of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wp.x, 0.1, wp.z);
    group.add(wheel);
  }

  return group;
}

export function spawnCar(graph: RoadGraph, startNodeId?: string): Car {
  const nodeIds = [...graph.nodes.keys()];
  if (nodeIds.length === 0) {
    throw new Error("Cannot spawn car: graph has no nodes");
  }

  const currentId = startNodeId ?? nodeIds[Math.floor(Math.random() * nodeIds.length)];
  const currentNode = graph.nodes.get(currentId);
  if (!currentNode) {
    throw new Error(`Node ${currentId} not found`);
  }

  let targetId: string;
  if (currentNode.connections.length > 0) {
    targetId = currentNode.connections[Math.floor(Math.random() * currentNode.connections.length)];
  } else {
    const others = nodeIds.filter((id) => id !== currentId);
    targetId = others[Math.floor(Math.random() * others.length)];
  }

  const color = Math.floor(Math.random() * 0xffffff);
  const mesh = createCarMesh(color);

  const car: Car = {
    mesh,
    currentNodeId: currentId,
    targetNodeId: targetId,
    progress: 0,
    speed: ROADS.CAR_SPEED,
    color,
  };

  updateCarPosition(car, graph);
  return car;
}

export function updateCarPosition(car: Car, graph: RoadGraph): void {
  const fromNode = graph.nodes.get(car.currentNodeId);
  const toNode = graph.nodes.get(car.targetNodeId);
  if (!fromNode || !toNode) return;

  const start = fromNode.position;
  const end = toNode.position;
  const direction = new THREE.Vector3().copy(end).sub(start);
  const length = direction.length();
  if (length < 0.01) return;

  const clampedProgress = Math.min(Math.max(car.progress, 0), 1);
  const pos = new THREE.Vector3().lerpVectors(start, end, clampedProgress);
  pos.y += 0.6;
  car.mesh.position.copy(pos);

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  car.mesh.quaternion.copy(quat);
}

export function updateCar(car: Car, graph: RoadGraph, delta: number): void {
  const fromNode = graph.nodes.get(car.currentNodeId);
  const toNode = graph.nodes.get(car.targetNodeId);
  if (!fromNode || !toNode) return;

  const distance = fromNode.position.distanceTo(toNode.position);
  if (distance < 0.01) {
    pickNextEdge(car, graph);
    return;
  }

  car.progress += (car.speed * delta) / distance;
  if (car.progress >= 1) {
    car.currentNodeId = car.targetNodeId;
    pickNextEdge(car, graph);
  }

  updateCarPosition(car, graph);
}

export function pickNextEdge(car: Car, graph: RoadGraph): void {
  car.progress = 0;
  const currentNode = graph.nodes.get(car.currentNodeId);
  if (!currentNode) return;

  const connections = currentNode.connections.filter((id) => id !== car.targetNodeId);
  if (connections.length > 0) {
    car.targetNodeId = connections[Math.floor(Math.random() * connections.length)];
  } else if (currentNode.connections.length > 0) {
    car.targetNodeId = currentNode.connections[Math.floor(Math.random() * currentNode.connections.length)];
  }
}
