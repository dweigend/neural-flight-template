import * as THREE from "three";
import type { RoadGraph } from "./road-network-types";
import type { Car } from "./car";
import { spawnCar, updateCar } from "./car";
import { ROADS } from "./road-config";
import { renderRoadNetwork, disposeRoadNetwork } from "./road-renderer";

export interface CarFleet {
  cars: Car[];
  carGroup: THREE.Group;
  roadGroup: THREE.Group;
  update(delta: number, graph: RoadGraph): void;
  dispose(): void;
}

export function createCarFleet(graph: RoadGraph, count: number = ROADS.CAR_COUNT): CarFleet {
  const cars: Car[] = [];
  const carGroup = new THREE.Group();
  const roadGroup = new THREE.Group();

  renderRoadNetwork(graph, roadGroup);

  for (let i = 0; i < count; i++) {
    const car = spawnCar(graph);
    car.speed = ROADS.CAR_SPEED + (Math.random() - 0.5) * 4;
    cars.push(car);
    carGroup.add(car.mesh);
  }

  return {
    cars,
    carGroup,
    roadGroup,

    update(delta: number, g: RoadGraph): void {
      for (const car of cars) {
        updateCar(car, g, delta);
      }
    },

    dispose(): void {
      for (const car of cars) {
        car.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              for (const m of child.material) m.dispose();
            } else {
              child.material.dispose();
            }
          }
        });
      }
      cars.length = 0;
      disposeRoadNetwork(roadGroup);
      disposeRoadNetwork(carGroup);
    },
  };
}
