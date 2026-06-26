export const BERLIN_CONE_PLACEMENT = {
  /**
   * Tilt is measured from straight down:
   * 0 = straight down, 90 = horizontal.
   */
  MIN_TILT_DEGREES: 10,
  MAX_TILT_DEGREES: 80,
  NEIGHBORHOOD_SEARCH_RADIUS: 32,
  MIN_NEARBY_SAMPLE_COUNT: 3,
  ROOF_CLEARANCE_EPSILON: 0.5,
  AMBIGUITY_THRESHOLD: 0.2,
  MAX_CONES_PER_TICK: 96,
} as const;
