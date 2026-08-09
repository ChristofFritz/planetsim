/** World units of planet radius per frequency unit — keeps tile size constant. */
export const TILE_SCALE = 100 / 24

/** One moon, fully editable. Orbit fields are live; seed/frequency/
 *  radiusFactor describe the body itself and need a moon rebuild. */
export interface MoonParams {
  seed: string
  /** Goldberg frequency of the moon's own hexsphere. */
  frequency: number
  /** Moon radius as a fraction of the planet radius. */
  radiusFactor: number
  /** Orbit radius as a multiple of the planet radius. */
  orbitFactor: number
  inclination: number
  /** Orbit-plane yaw (longitude of ascending node). */
  node: number
  /** Orbital angular speed (rad/s), negative = prograde. */
  speed: number
  /** Current orbit angle — advances every frame, scrubbable. */
  phase: number
}

export const CONFIG = {
  /** Planet base radius (world units). Derived from frequency; updated on regenerate. */
  radius: 144 * TILE_SCALE,
  /** Goldberg frequency: tiles = 10*f^2 + 2. Radius scales with it, so higher = bigger planet. */
  frequency: 144,
  seed: 'utopia',
  /** Elevation value [0..1] below which a tile is ocean. */
  seaLevel: 0.5,
  /** Ocean sphere sits this far above the base radius. */
  seaHeight: 1.0,
  /** Lowest land tile top above base radius. */
  landBaseHeight: 2.0,
  /** Extra height per elevation step. */
  stepHeight: 0.6,
  /** Number of quantized land elevation steps. */
  heightSteps: 16,
  /** Land tiles are extruded down to radius - baseDepth (hides gaps under ocean). */
  baseDepth: 1.0,
  /** Planet generation tunables — all read live by PlanetGen/biomes, so a
   *  regenerate after mutation is enough to apply them. */
  gen: {
    elevation: {
      detailOctaves: 5,
      detailFreq: 1.8,
      detailWeight: 0.55,
      continentOctaves: 2,
      continentFreq: 0.9,
      continentWeight: 0.65,
      lacunarity: 2.0,
      gain: 0.5,
      /** e = (detail+continents) * scale + bias, clamped to [0..1]. */
      scale: 0.75,
      bias: 0.5,
    },
    moisture: {
      octaves: 4,
      freq: 2.2,
      bias: 0,
    },
    temperature: {
      /** Pole falloff sharpness: t = 1 - |lat|^poleExponent. */
      poleExponent: 1.4,
      /** How much altitude cools a tile. */
      elevationCooling: 0.45,
      /** Global warming/cooling knob. */
      offset: 0,
    },
    biomes: {
      beachElev: 0.04,
      beachSnowTemp: 0.15,
      mountainElev: 0.6,
      mountainSnowTemp: 0.35,
      snowTemp: 0.08,
      tundraTemp: 0.2,
      desertTemp: 0.6,
      desertMoisture: 0.3,
      rainforestMoisture: 0.66,
      rainforestTemp: 0.7,
      forestMoisture: 0.5,
    },
  },
  /** Atmosphere scattering — read live every frame, no rebuild needed.
   *  Scale heights and height are fractions of the planet radius. */
  atmosphere: {
    enabled: true,
    height: 0.1,
    rayleighScaleHeight: 0.014,
    mieScaleHeight: 0.004,
    /** Rayleigh scattering coefficient at wavelengthB; R/G derive via 1/λ⁴. */
    rayleighStrength: 0.032,
    wavelengthR: 680,
    wavelengthG: 550,
    wavelengthB: 440,
    mieStrength: 0.004,
    mieG: 0.76,
    sunIntensity: 22,
    exposure: 1,
    samples: 12,
    lightSamples: 6,
  },
  orbit: {
    /** Star radius as a multiple of planet radius (rebuild to apply). */
    starRadiusFactor: 2.2,
    /** Planet orbit radius as a multiple of planet radius. Live. */
    orbitRadiusFactor: 20,
    /** Planet orbital angular speed (rad/s). Live. */
    planetSpeed: 0.006,
    /** Current orbit angle — advances every frame, scrubbable.
     *  Initial value puts the lit side toward the default camera. */
    angle: 4.33,
  },
  /** Filled from the world seed at startup / on seed change; then editable. */
  moons: [] as MoonParams[],
  camera: {
    minDistance: 4,
    /** Factors are multiples of the current planet radius. Max allows zooming
     *  out far enough to see the whole star system. */
    maxDistanceFactor: 40,
    initialDistanceFactor: 3.5,
    /** Altitude blend range: below near = full ground mode, above far*radius = orbit. */
    blendNear: 15,
    blendFarFactor: 1.2,
    maxPitch: 1.5,
    /** Pan sensitivity stops growing beyond this many planet radii out. */
    panDistanceCapFactor: 2.5,
  },
}

export type Config = typeof CONFIG
