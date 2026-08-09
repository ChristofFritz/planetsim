import alea from 'alea'

/** Deterministic PRNG derived from a base seed plus a purpose tag. */
export function subRng(seed: string, tag: string) {
  return alea(`${seed}:${tag}`)
}
