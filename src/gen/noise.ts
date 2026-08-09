import { createNoise3D, type NoiseFunction3D } from 'simplex-noise'
import type * as THREE from 'three'
import { subRng } from './rng'

export function seededNoise3D(seed: string, tag: string): NoiseFunction3D {
  return createNoise3D(subRng(seed, tag))
}

/** Fractal brownian motion over a 3D point. Returns roughly [-1, 1]. */
export function fbm(
  noise: NoiseFunction3D,
  p: THREE.Vector3,
  octaves: number,
  frequency: number,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let amp = 1
  let freq = frequency
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(p.x * freq, p.y * freq, p.z * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
