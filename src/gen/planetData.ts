import * as THREE from 'three'
import type { NoiseFunction3D } from 'simplex-noise'
import { CONFIG } from '../config'
import { fbm, seededNoise3D } from './noise'
import { Biome, displayBiome } from './biomes'

export interface TileInfo {
  biome: Biome
  /** Quantized land elevation step, 0..heightSteps-1. -1 for ocean. */
  step: number
  elevation: number
  moisture: number
  temperature: number
}

/**
 * Pure, seeded planet sampler. Everything is a function of a unit-sphere
 * point, so terrain, decorations and the camera ground clamp all agree.
 */
export class PlanetGen {
  private elevNoise: NoiseFunction3D
  private continentNoise: NoiseFunction3D
  private moistNoise: NoiseFunction3D

  readonly seed: string
  readonly seaLevel: number

  constructor(seed: string, seaLevel: number = CONFIG.seaLevel) {
    this.seed = seed
    this.seaLevel = seaLevel
    this.elevNoise = seededNoise3D(seed, 'elev')
    this.continentNoise = seededNoise3D(seed, 'continent')
    this.moistNoise = seededNoise3D(seed, 'moist')
  }

  /** Elevation in [0..1]; seaLevel is the waterline. */
  elevation(p: THREE.Vector3): number {
    const g = CONFIG.gen.elevation
    const detail = fbm(this.elevNoise, p, g.detailOctaves, g.detailFreq, g.lacunarity, g.gain)
    const continents = fbm(this.continentNoise, p, g.continentOctaves, g.continentFreq, g.lacunarity, g.gain)
    const e = g.detailWeight * detail + g.continentWeight * continents
    return THREE.MathUtils.clamp(e * g.scale + g.bias, 0, 1)
  }

  moisture(p: THREE.Vector3): number {
    const g = CONFIG.gen.moisture
    return THREE.MathUtils.clamp(fbm(this.moistNoise, p, g.octaves, g.freq) * 0.5 + 0.5 + g.bias, 0, 1)
  }

  /**
   * Base temperature (tempOffset = 0). The sim applies the global cycle
   * offset on top of cached base values; pass tempOffset here only for
   * one-off queries.
   */
  temperature(p: THREE.Vector3, elevN: number, tempOffset = 0): number {
    const g = CONFIG.gen.temperature
    const latitude = Math.abs(p.y) // p is a unit vector, y = sin(lat)
    const t = 1 - Math.pow(latitude, g.poleExponent) - g.elevationCooling * Math.max(0, elevN) + g.offset + tempOffset
    return THREE.MathUtils.clamp(t, 0, 1)
  }

  tileInfo(p: THREE.Vector3, tempOffset = 0): TileInfo {
    const elevation = this.elevation(p)
    const moisture = this.moisture(p)
    if (elevation < this.seaLevel) {
      return { biome: Biome.Ocean, step: -1, elevation, moisture, temperature: 0.5 }
    }
    const elevN = (elevation - this.seaLevel) / (1 - this.seaLevel)
    const temperature = this.temperature(p, elevN, tempOffset)
    const biome = displayBiome(elevN, moisture, temperature)
    const step = Math.min(CONFIG.heightSteps - 1, Math.floor(elevN * CONFIG.heightSteps))
    return { biome, step, elevation, moisture, temperature }
  }

  /** Top radius of a land tile at quantized step. */
  static topRadius(step: number): number {
    return CONFIG.radius + CONFIG.landBaseHeight + step * CONFIG.stepHeight
  }

  static seaRadius(): number {
    return CONFIG.radius + CONFIG.seaHeight
  }

  /** Terrain (or sea) surface radius under a unit-sphere point — camera clamp. */
  groundRadius(p: THREE.Vector3): number {
    const info = this.tileInfo(p)
    if (info.step < 0) return PlanetGen.seaRadius()
    return PlanetGen.topRadius(info.step)
  }
}
