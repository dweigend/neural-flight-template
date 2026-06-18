export const BERLIN_EXPERIENCE_ID = "berlin-flight";

export const BERLIN_TILE_RUNTIME = {
  id: "3d-tiles-renderer",
  packageName: "3d-tiles-renderer",
  moduleUrl: "https://esm.sh/3d-tiles-renderer",
  reason: "Best fit for a Three.js + WebXR + WebGL phase-1 runtime.",
} as const;

export const BERLIN_CAMERA = {
  fov: 75,
  near: 0.1,
  far: 2000,
} as const;

export const BERLIN_SCENE = {
  background: "#0c1020",
  fogColor: "#0c1020",
  fogNear: 100,
  fogFar: 1200,
  ambientIntensity: 0.4,
  sunIntensity: 1.2,
  sunColor: "#ffffff",
  sunPosition: { x: 80, y: 120, z: 60 },
} as const;

export const BERLIN_SPAWN = {
  position: { x: 0, y: 120, z: 0 },
} as const;

export const BERLIN_DEFAULT_SETTINGS = {
  baseSpeed: 12,
  showPlaceholder: false,
} as const;

export const BERLIN_FALLBACK_SOURCE = {
  assetId: "2275207", // Google Photorealistic 3D Tiles
  accessToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2N2U3ZjA5NS1mODFiLTRlOTgtYTA0ZS04ZGVmN2FiMDkxYTEiLCJpZCI6NDQ1NzMxLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODE3MDA4MDN9.CIfCPAvb43pMNGjq-ay5dZv6mkDk9-vW7AskIxSXZnY",
} as const;
