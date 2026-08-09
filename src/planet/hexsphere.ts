import * as THREE from 'three'

export interface Tile {
  /** Unit vector — tile center on the unit sphere. */
  center: THREE.Vector3
  /** Unit vectors — polygon corners, 5 or 6, wound CCW seen from outside. */
  boundary: THREE.Vector3[]
  /** Indices of adjacent tiles. */
  neighbors: number[]
}

const GOLDEN = (1 + Math.sqrt(5)) / 2

const ICO_VERTS: [number, number, number][] = [
  [-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0],
  [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN],
  [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1],
]

const ICO_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

/**
 * Goldberg polyhedron GP(f, 0): subdivide an icosahedron with frequency f,
 * project to the unit sphere, then dualize — every vertex becomes a tile
 * whose corners are the centroids of its incident triangles.
 * Produces 10*f^2 + 2 tiles: 12 pentagons (the original icosahedron
 * vertices), the rest hexagons.
 */
export function buildHexsphere(frequency: number): Tile[] {
  const f = frequency
  const base = ICO_VERTS.map((v) => new THREE.Vector3(...v).normalize())

  // --- subdivide, deduplicating vertices shared between faces ---
  const verts: THREE.Vector3[] = []
  const indexByKey = new Map<string, number>()
  const addVert = (v: THREE.Vector3): number => {
    const key = `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`
    let i = indexByKey.get(key)
    if (i === undefined) {
      i = verts.length
      verts.push(v.clone())
      indexByKey.set(key, i)
    }
    return i
  }

  const tris: [number, number, number][] = []
  for (const [ia, ib, ic] of ICO_FACES) {
    const a = base[ia], b = base[ib], c = base[ic]
    // Barycentric lattice: grid[i][j] with i toward b, j toward c, i + j <= f.
    const grid: number[][] = []
    for (let i = 0; i <= f; i++) {
      const row: number[] = []
      for (let j = 0; j <= f - i; j++) {
        const p = new THREE.Vector3()
          .addScaledVector(a, (f - i - j) / f)
          .addScaledVector(b, i / f)
          .addScaledVector(c, j / f)
          .normalize()
        row.push(addVert(p))
      }
      grid.push(row)
    }
    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        tris.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]])
        if (j < f - i - 1) tris.push([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])
      }
    }
  }

  // --- dualize ---
  const incident: number[][] = verts.map(() => [])
  tris.forEach((tri, ti) => {
    for (const vi of tri) incident[vi].push(ti)
  })
  const centroids = tris.map(([i, j, k]) =>
    new THREE.Vector3().add(verts[i]).add(verts[j]).add(verts[k]).divideScalar(3).normalize(),
  )
  const neighborSets: Set<number>[] = verts.map(() => new Set())
  for (const [i, j, k] of tris) {
    neighborSets[i].add(j).add(k)
    neighborSets[j].add(i).add(k)
    neighborSets[k].add(i).add(j)
  }

  return verts.map((center, vi) => {
    // Sort incident centroids by angle in the tangent plane at the vertex.
    const ref = Math.abs(center.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(center, ref).normalize()
    const v = new THREE.Vector3().crossVectors(center, u)
    const boundary = incident[vi]
      .map((ti) => centroids[ti])
      .sort((p, q) => {
        const ap = Math.atan2(p.dot(v), p.dot(u))
        const aq = Math.atan2(q.dot(v), q.dot(u))
        return ap - aq
      })
      .map((c) => c.clone())

    // Enforce CCW winding seen from outside the sphere.
    const e1 = new THREE.Vector3().subVectors(boundary[1], boundary[0])
    const e2 = new THREE.Vector3().subVectors(boundary[2], boundary[0])
    if (new THREE.Vector3().crossVectors(e1, e2).dot(center) < 0) boundary.reverse()

    return { center: center.clone(), boundary, neighbors: [...neighborSets[vi]] }
  })
}
