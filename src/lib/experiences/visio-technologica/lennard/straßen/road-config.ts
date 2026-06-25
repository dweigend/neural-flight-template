export const ROADS = {
  CAR_COUNT: 5,
  CAR_SPEED: 8,

  // Asphalt
  ROAD_WIDTH: 8, // total asphalt width (2 lanes + margins)
  ROAD_THICKNESS: 0.15, // asphalt depth
  ROAD_Y_TOP: 0, // world-y of the asphalt surface (top)

  // Sidewalks
  SIDEWALK_WIDTH: 1.5, // width of one sidewalk
  SIDEWALK_HEIGHT: 0.25, // height above asphalt

  // Curb (Bordsteinkante)
  CURB_HEIGHT: 0.18,
  CURB_WIDTH: 0.2,

  // Lane markings
  LANE_MARKER_LENGTH: 1.6, // length of one yellow dash
  LANE_MARKER_GAP: 1.6, // gap between dashes
  LANE_MARKER_WIDTH: 0.18, // width of the yellow line
  LANE_MARKER_THICKNESS: 0.02, // height above asphalt
  LANE_MARKER_END_PADDING: 1.5, // skip this much near intersections (no dashes in junction)

  // White edge lines
  EDGE_LINE_WIDTH: 0.15,
  EDGE_LINE_INSET: 0.12, // distance from asphalt edge to white line
  EDGE_LINE_THICKNESS: 0.02,

  // Crosswalk (Zebrastreifen) at intersections
  CROSSWALK_DISTANCE_FROM_NODE: 0.5, // how far from the node center
  CROSSWALK_STRIP_LENGTH: 2.5, // depth of the crosswalk (along road)
  CROSSWALK_STRIP_WIDTH: 0.45, // width of one white bar
  CROSSWALK_STRIP_COUNT: 6, // number of bars
  CROSSWALK_STRIP_GAP: 0.45, // gap between bars
  CROSSWALK_STRIP_THICKNESS: 0.025,
} as const;
