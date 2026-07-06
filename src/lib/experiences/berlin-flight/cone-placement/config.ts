export const BERLIN_CONE_PLACEMENT = {
  /**
   * Tilt is measured from straight down:
   * 0 = straight down, 90 = horizontal.
   */
  MIN_TILT_DEGREES: 10,
  MAX_TILT_DEGREES: 80,
  NEIGHBORHOOD_SEARCH_RADIUS: 48,
  MIN_NEARBY_SAMPLE_COUNT: 1,
  MAX_DIRECTION_SAMPLES: 6,
  ROOF_CLEARANCE_EPSILON: 0.5,
  AMBIGUITY_THRESHOLD: 0.1,
  MAX_CONES_PER_TICK: 96,
  DEBUG_MARKERS: {
    MAX_MARKERS: 512,
    TIP_SIZE: 1.8,
    OPACITY: 0.9,
    TIP_COLOR: 0xffd166,
    AXIS_COLOR: 0x7bdff2,
  },
} as const;
