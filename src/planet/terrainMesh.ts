import * as THREE from 'three'
import { CONFIG } from '../config'
import { BIOME_DEFS } from '../gen/biomes'
import { PlanetGen, type TileInfo } from '../gen/planetData'
import { subRng } from '../gen/rng'
import type { Tile } from './hexsphere'

export const SIDE_DARKEN = 0.68

export interface TerrainBuild {
  mesh: THREE.Mesh
  /** 4 ints per tile: topStart, topCount, wallStart, wallCount — VERTEX indices into the merged buffer. Ocean tiles are all zeros. */
  tileRanges: Int32Array
  /** Triangle index -> tile index. */
  faceToTile: Uint32Array
  /** Per-tile color jitter so recoloring reproduces the hand-painted look. */
  tileJitter: Float32Array
}

/** The neighbor sharing boundary edge k = the one whose center is closest to the edge midpoint. */
export function edgeNeighbor(tiles: Tile[], tile: Tile, k: number, edgeMid: THREE.Vector3): number {
  const n = tile.boundary.length
  edgeMid.copy(tile.boundary[k]).add(tile.boundary[(k + 1) % n])
  let best = -1
  let bestDot = -Infinity
  for (const ni of tile.neighbors) {
    const d = edgeMid.dot(tiles[ni].center)
    if (d > bestDot) {
      bestDot = d
      best = ni
    }
  }
  return best
}

export interface EmitSink {
  positions: number[]
  colors: number[]
  faceTiles: number[]
}

/**
 * Emit one land tile: all top-fan triangles first, then cliff walls
 * (only where the neighbor is lower — hidden walls are culled).
 * `stepOf` abstracts height lookup so terraform overrides can reuse this.
 * Returns [topVertexCount, wallVertexCount].
 */
export function emitTile(
  tiles: Tile[],
  ti: number,
  stepOf: (ti: number) => number,
  biomeColor: THREE.Color,
  sideColor: THREE.Color,
  sink: EmitSink,
  edgeMid: THREE.Vector3,
): [number, number] {
  const tile = tiles[ti]
  const step = stepOf(ti)
  const topR = PlanetGen.topRadius(step)
  const baseRadius = CONFIG.radius - CONFIG.baseDepth
  const n = tile.boundary.length

  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    col: THREE.Color,
  ) => {
    sink.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
    for (let i = 0; i < 3; i++) sink.colors.push(col.r, col.g, col.b)
    sink.faceTiles.push(ti)
  }

  const c = tile.center
  let topVerts = 0
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n
    const p = tile.boundary[k]
    const q = tile.boundary[k1]
    pushTri(
      c.x * topR, c.y * topR, c.z * topR,
      p.x * topR, p.y * topR, p.z * topR,
      q.x * topR, q.y * topR, q.z * topR,
      biomeColor,
    )
    topVerts += 3
  }

  let wallVerts = 0
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n
    const neighborStep = stepOf(edgeNeighbor(tiles, tile, k, edgeMid))
    if (neighborStep >= step) continue
    const bottomR = neighborStep < 0 ? baseRadius : PlanetGen.topRadius(neighborStep)
    const p = tile.boundary[k]
    const q = tile.boundary[k1]
    pushTri(
      p.x * topR, p.y * topR, p.z * topR,
      p.x * bottomR, p.y * bottomR, p.z * bottomR,
      q.x * bottomR, q.y * bottomR, q.z * bottomR,
      sideColor,
    )
    pushTri(
      p.x * topR, p.y * topR, p.z * topR,
      q.x * bottomR, q.y * bottomR, q.z * bottomR,
      q.x * topR, q.y * topR, q.z * topR,
      sideColor,
    )
    wallVerts += 6
  }
  return [topVerts, wallVerts]
}

/**
 * All land tiles merged into one non-indexed, vertex-colored geometry.
 * Non-indexed means duplicated vertices per face, which gives hard edges
 * for free once computeVertexNormals() assigns per-face normals.
 * Tiles are emitted contiguously (tops, then walls) so per-tile vertex
 * ranges support in-place recoloring and eviction.
 */
export function buildTerrainMesh(tiles: Tile[], infos: TileInfo[], seed: string): TerrainBuild {
  const sink: EmitSink = { positions: [], colors: [], faceTiles: [] }
  const rng = subRng(seed, 'tilecolor')
  const tileRanges = new Int32Array(tiles.length * 4)
  const tileJitter = new Float32Array(tiles.length)

  const color = new THREE.Color()
  const side = new THREE.Color()
  const edgeMid = new THREE.Vector3()
  const stepOf = (ti: number) => infos[ti].step

  for (let ti = 0; ti < tiles.length; ti++) {
    const jitter = 0.93 + rng() * 0.14
    tileJitter[ti] = jitter
    const info = infos[ti]
    if (info.step < 0) continue // ocean: no hexagon

    color.setHex(BIOME_DEFS[info.biome].color).multiplyScalar(jitter)
    side.copy(color).multiplyScalar(SIDE_DARKEN)

    const topStart = sink.positions.length / 3
    const [topVerts, wallVerts] = emitTile(tiles, ti, stepOf, color, side, sink, edgeMid)
    tileRanges[ti * 4] = topStart
    tileRanges[ti * 4 + 1] = topVerts
    tileRanges[ti * 4 + 2] = topStart + topVerts
    tileRanges[ti * 4 + 3] = wallVerts
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(sink.positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(sink.colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'terrain'
  return { mesh, tileRanges, faceToTile: new Uint32Array(sink.faceTiles), tileJitter }
}

/** Debug overlay: tile outlines slightly above each tile top. */
export function buildTileEdges(tiles: Tile[], infos: TileInfo[]): THREE.LineSegments {
  const positions: number[] = []
  for (let ti = 0; ti < tiles.length; ti++) {
    const info = infos[ti]
    const r = (info.step < 0 ? PlanetGen.seaRadius() : PlanetGen.topRadius(info.step)) + 0.15
    const b = tiles[ti].boundary
    for (let k = 0; k < b.length; k++) {
      const p = b[k], q = b[(k + 1) % b.length]
      positions.push(p.x * r, p.y * r, p.z * r, q.x * r, q.y * r, q.z * r)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  )
  lines.name = 'tileEdges'
  return lines
}
