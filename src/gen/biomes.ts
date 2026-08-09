import { CONFIG } from '../config'

export const Biome = {
  Ocean: 0,
  Beach: 1,
  Grassland: 2,
  Forest: 3,
  Rainforest: 4,
  Desert: 5,
  Tundra: 6,
  Snow: 7,
  Mountain: 8,
} as const

export type Biome = (typeof Biome)[keyof typeof Biome]

export type DecorationKind = 'tree' | 'rock' | 'cactus'

export interface BiomeDef {
  color: number
  /** Food production multiplier for the sim. */
  fertility: number
  decoration?: { kind: DecorationKind; count: number; chance: number }
}

export const BIOME_DEFS: Record<Biome, BiomeDef> = {
  [Biome.Ocean]: { color: 0x1a4f7a, fertility: 0 },
  [Biome.Beach]: { color: 0xe8d29a, fertility: 0.3 },
  [Biome.Grassland]: { color: 0x7fba5c, fertility: 1.0 },
  [Biome.Forest]: { color: 0x4c8f4a, fertility: 0.9, decoration: { kind: 'tree', count: 3, chance: 1 } },
  [Biome.Rainforest]: { color: 0x2e7d46, fertility: 1.1, decoration: { kind: 'tree', count: 4, chance: 1 } },
  [Biome.Desert]: { color: 0xe0c068, fertility: 0.15, decoration: { kind: 'cactus', count: 1, chance: 0.4 } },
  [Biome.Tundra]: { color: 0x9fae94, fertility: 0.3, decoration: { kind: 'rock', count: 1, chance: 0.3 } },
  [Biome.Snow]: { color: 0xeef2f5, fertility: 0 },
  [Biome.Mountain]: { color: 0x8d8579, fertility: 0.1, decoration: { kind: 'rock', count: 2, chance: 0.5 } },
}

/** Biome as displayed, including the beach band and its frozen variant. */
export function displayBiome(elevN: number, moisture: number, temperature: number): Biome {
  const b = CONFIG.gen.biomes
  if (elevN < b.beachElev) return temperature < b.beachSnowTemp ? Biome.Snow : Biome.Beach
  return assignBiome(elevN, moisture, temperature)
}

/**
 * Whittaker-style lookup. elevN is elevation above sea normalized to [0..1],
 * temperature and moisture are [0..1]. Thresholds live in CONFIG.gen.biomes.
 */
export function assignBiome(elevN: number, moisture: number, temperature: number): Biome {
  const b = CONFIG.gen.biomes
  if (elevN > b.mountainElev) return temperature < b.mountainSnowTemp ? Biome.Snow : Biome.Mountain
  if (temperature < b.snowTemp) return Biome.Snow
  if (temperature < b.tundraTemp) return Biome.Tundra
  if (temperature > b.desertTemp && moisture < b.desertMoisture) return Biome.Desert
  if (moisture > b.rainforestMoisture) return temperature > b.rainforestTemp ? Biome.Rainforest : Biome.Forest
  if (moisture > b.forestMoisture) return Biome.Forest
  return Biome.Grassland
}
