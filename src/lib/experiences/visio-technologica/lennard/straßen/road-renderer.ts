import * as THREE from "three";
import type { RoadGraph } from "./road-network-types";
import { ROADS } from "./road-config";

// ─── Shared (module-level) materials ─────────────────────────────────────────
// Sharing materials avoids the per-edge allocation churn AND avoids the
// disposeRoadNetwork() trap of disposing a material that is referenced by
// many meshes.

const ASPHALT_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a2a2e, // German asphalt: very dark grey, almost black
  roughness: 0.95,
  metalness: 0.0,
});

const SIDEWALK_MAT = new THREE.MeshStandardMaterial({
  color: 0xb8b0a0, // light beige concrete
  roughness: 0.85,
  metalness: 0.0,
});

const CURB_MAT = new THREE.MeshStandardMaterial({
  color: 0x9a9080, // darker than sidewalk, the Bordsteinkante
  roughness: 0.8,
  metalness: 0.0,
});

const CENTER_LINE_MAT = new THREE.MeshStandardMaterial({
  color: 0xffd200, // German road-marking yellow
  roughness: 0.6,
  metalness: 0.0,
});

const EDGE_LINE_MAT = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.0,
});

const CROSSWALK_MAT = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.0,
});

// ─── Geometry helpers ────────────────────────────────────────────────────────
//
// We orient every road segment with a Y-rotation only (the road lies in the
// XZ-plane in its local frame). Given that, local +Z is "along the road"
// and local +X is "across the road". BoxGeometry args are (W, H, D):
//
//   BoxGeometry(width, height, depth)
//     - width  (X)  = across the road
//     - height (Y)  = thickness (vertical)
//     - depth  (Z)  = along the road
//
// So an asphalt slab is BoxGeometry(ROAD_WIDTH, ROAD_THICKNESS, length) —
// the length is the only dimension that varies between segments.

function asphaltGeo(length: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(ROADS.ROAD_WIDTH, ROADS.ROAD_THICKNESS, length);
}

function sidewalkGeo(length: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(
    ROADS.SIDEWALK_WIDTH,
    ROADS.SIDEWALK_HEIGHT,
    length,
  );
}

function curbGeo(length: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(ROADS.CURB_WIDTH, ROADS.CURB_HEIGHT, length);
}

function edgeLineGeo(length: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(
    ROADS.EDGE_LINE_WIDTH,
    ROADS.EDGE_LINE_THICKNESS,
    length,
  );
}

const CENTER_DASH_GEO = new THREE.BoxGeometry(
  ROADS.LANE_MARKER_WIDTH,
  ROADS.LANE_MARKER_THICKNESS,
  ROADS.LANE_MARKER_LENGTH,
);

const CROSSWALK_BAR_GEO = new THREE.BoxGeometry(
  ROADS.CROSSWALK_STRIP_WIDTH,
  ROADS.CROSSWALK_STRIP_THICKNESS,
  ROADS.CROSSWALK_STRIP_LENGTH,
);

// Top of asphalt in world space — every road marking sits this high above
// (or below, for the asphalt box body) the world origin.
const ASPHALT_TOP_Y = ROADS.ROAD_Y_TOP;
const ASPHALT_BOTTOM_Y = ASPHALT_TOP_Y - ROADS.ROAD_THICKNESS;

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderRoadNetwork(
  graph: RoadGraph,
  roadGroup: THREE.Group,
): void {
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const start = fromNode.position;
    const end = toNode.position;
    const direction = new THREE.Vector3().copy(end).sub(start);
    const length = direction.length();
    if (length < 0.01) continue;

    // Y-rotation: angle from world +Z to the road direction.
    // Note: BoxGeometry sits flat in XZ with its depth along +Z, so a
    // rotation about Y is enough to align it with the road.
    const angleY = Math.atan2(direction.x, direction.z);

    // Local axes in world space (after applying angleY rotation about Y):
    //   +Z (forward, along the road): ( sin(θ), 0,  cos(θ))
    //   +X (across the road):         ( cos(θ), 0, −sin(θ))
    const forward = new THREE.Vector3(Math.sin(angleY), 0, Math.cos(angleY));
    const across = new THREE.Vector3(Math.cos(angleY), 0, -Math.sin(angleY));

    const mid = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);

    // 1. Asphalt slab ────────────────────────────────────────────────────────
    const asphalt = new THREE.Mesh(asphaltGeo(length), ASPHALT_MAT);
    asphalt.position.set(
      mid.x,
      ASPHALT_BOTTOM_Y + ROADS.ROAD_THICKNESS / 2,
      mid.z,
    );
    asphalt.rotation.y = angleY;
    asphalt.receiveShadow = true;
    roadGroup.add(asphalt);

    // 2. Sidewalks (Bürgersteig), one on each side ───────────────────────────
    const halfRoadW = ROADS.ROAD_WIDTH / 2;
    const halfSideW = ROADS.SIDEWALK_WIDTH / 2;
    const sidewalkOffsetX = halfRoadW + halfSideW;
    const sidewalkCenterY = ASPHALT_TOP_Y + ROADS.SIDEWALK_HEIGHT / 2;
    for (const sign of [-1, 1]) {
      const sidewalk = new THREE.Mesh(sidewalkGeo(length), SIDEWALK_MAT);
      sidewalk.position.set(
        mid.x + across.x * sign * sidewalkOffsetX,
        sidewalkCenterY,
        mid.z + across.z * sign * sidewalkOffsetX,
      );
      sidewalk.rotation.y = angleY;
      sidewalk.receiveShadow = true;
      sidewalk.castShadow = true;
      roadGroup.add(sidewalk);
    }

    // 3. Curb strip between asphalt and sidewalk ────────────────────────────
    const curbOffsetX = halfRoadW + ROADS.CURB_WIDTH / 2;
    const curbCenterY = ASPHALT_TOP_Y + ROADS.CURB_HEIGHT / 2;
    for (const sign of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo(length), CURB_MAT);
      curb.position.set(
        mid.x + across.x * sign * curbOffsetX,
        curbCenterY,
        mid.z + across.z * sign * curbOffsetX,
      );
      curb.rotation.y = angleY;
      curb.receiveShadow = true;
      roadGroup.add(curb);
    }

    // 4. White edge lines just inside the asphalt edge ───────────────────────
    const edgeLineOffsetX = halfRoadW - ROADS.EDGE_LINE_INSET;
    const edgeLineCenterY = ASPHALT_TOP_Y + ROADS.EDGE_LINE_THICKNESS / 2;
    for (const sign of [-1, 1]) {
      const line = new THREE.Mesh(edgeLineGeo(length), EDGE_LINE_MAT);
      line.position.set(
        mid.x + across.x * sign * edgeLineOffsetX,
        edgeLineCenterY,
        mid.z + across.z * sign * edgeLineOffsetX,
      );
      line.rotation.y = angleY;
      roadGroup.add(line);
    }

    // 5. Yellow center dashes ────────────────────────────────────────────────
    // Skip the segment close to each intersection (LANE_MARKER_END_PADDING)
    // so the dashes don't crash into the crosswalk.
    const padding = ROADS.LANE_MARKER_END_PADDING;
    const usableLength = length - 2 * padding;
    if (usableLength > 0) {
      const cycle = ROADS.LANE_MARKER_LENGTH + ROADS.LANE_MARKER_GAP;
      const count = Math.max(0, Math.floor(usableLength / cycle));
      if (count > 0) {
        // We want the dashes centred in the usable section.
        const usedByDashes =
          count * ROADS.LANE_MARKER_LENGTH +
          (count - 1) * ROADS.LANE_MARKER_GAP;
        const firstDashLocalZ =
          padding +
          (usableLength - usedByDashes) / 2 +
          ROADS.LANE_MARKER_LENGTH / 2 -
          length / 2;
        const dashCenterY = ASPHALT_TOP_Y + ROADS.LANE_MARKER_THICKNESS / 2;
        for (let i = 0; i < count; i++) {
          const localZ = firstDashLocalZ + i * cycle;
          const dash = new THREE.Mesh(CENTER_DASH_GEO, CENTER_LINE_MAT);
          dash.position.set(
            mid.x + forward.x * localZ,
            dashCenterY,
            mid.z + forward.z * localZ,
          );
          dash.rotation.y = angleY;
          roadGroup.add(dash);
        }
      }
    }
  }

  // 6. Crosswalks (Zebrastreifen) — one per edge end at each connected node.
  // We do this in a second pass so the crosswalks from the "from" end and the
  // "to" end of an edge both render and don't interfere with the dash layout.
  renderCrosswalks(graph, roadGroup);
}

function renderCrosswalks(graph: RoadGraph, roadGroup: THREE.Group): void {
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const direction = new THREE.Vector3()
      .copy(toNode.position)
      .sub(fromNode.position);
    const length = direction.length();
    if (length < 0.01) continue;
    const angleY = Math.atan2(direction.x, direction.z);
    const forward = new THREE.Vector3(Math.sin(angleY), 0, Math.cos(angleY));
    const across = new THREE.Vector3(Math.cos(angleY), 0, -Math.sin(angleY));

    // Each edge contributes crosswalks at BOTH of its ends. We do it this
    // way (rather than once per node) so we don't have to track which
    // edges meet at a node and risk double-rendering or missing turns.
    for (const anchor of [fromNode, toNode]) {
      const isFrom = anchor === fromNode;
      const sign = isFrom ? 1 : -1; // which way along the edge

      const centerLocalZ =
        sign *
        (ROADS.CROSSWALK_DISTANCE_FROM_NODE + ROADS.CROSSWALK_STRIP_LENGTH / 2);
      const cwCenter = new THREE.Vector3()
        .copy(anchor.position)
        .add(forward.clone().multiplyScalar(centerLocalZ));

      const stripPitch =
        ROADS.CROSSWALK_STRIP_WIDTH + ROADS.CROSSWALK_STRIP_GAP;
      const totalBarsWidth =
        ROADS.CROSSWALK_STRIP_COUNT * ROADS.CROSSWALK_STRIP_WIDTH +
        (ROADS.CROSSWALK_STRIP_COUNT - 1) * ROADS.CROSSWALK_STRIP_GAP;
      const startOffsetX =
        -totalBarsWidth / 2 + ROADS.CROSSWALK_STRIP_WIDTH / 2;

      const barCenterY = ASPHALT_TOP_Y + ROADS.CROSSWALK_STRIP_THICKNESS / 2;
      for (let i = 0; i < ROADS.CROSSWALK_STRIP_COUNT; i++) {
        const localX = startOffsetX + i * stripPitch;
        const bar = new THREE.Mesh(CROSSWALK_BAR_GEO, CROSSWALK_MAT);
        bar.position.set(
          cwCenter.x + across.x * localX,
          barCenterY,
          cwCenter.z + across.z * localX,
        );
        bar.rotation.y = angleY;
        roadGroup.add(bar);
      }
    }
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
//
// Geometries are per-edge (length varies), so they MUST be disposed.
// Materials are module-level and shared, so we deliberately do NOT dispose
// them — disposing a shared material is the kind of bug that only shows up
// on the third reload.
export function disposeRoadNetwork(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}
