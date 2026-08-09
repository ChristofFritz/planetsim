import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BIOME_DEFS, type DecorationKind } from '../gen/biomes'
import { PlanetGen, type TileInfo } from '../gen/planetData'
import { subRng } from '../gen/rng'
import type { Tile } from './hexsphere'

function colored(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count
  const color = new THREE.Color(hex)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function treeGeometry(): THREE.BufferGeometry {
  const crown = colored(new THREE.ConeGeometry(0.9, 2.4, 5).translate(0, 2.2, 0), 0x2f6b33)
  const trunk = colored(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 5).translate(0, 0.6, 0), 0x6b4a2f)
  return mergeGeometries([crown.toNonIndexed(), trunk.toNonIndexed()])
}

function rockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.7, 0)
  const pos = geo.getAttribute('position')
  const rng = subRng('rock', 'shape')
  for (let i = 0; i < pos.count; i++) {
    const s = 0.75 + rng() * 0.5
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.7 + 0.35, pos.getZ(i) * s)
  }
  return colored(geo, 0x7d7a72)
}

function cactusGeometry(): THREE.BufferGeometry {
  return colored(new THREE.CylinderGeometry(0.28, 0.32, 1.8, 6).translate(0, 0.9, 0), 0x3f7d3a)
}

const GEOMETRY_BUILDERS: Record<DecorationKind, () => THREE.BufferGeometry> = {
  tree: treeGeometry,
  rock: rockGeometry,
  cactus: cactusGeometry,
}

export class DecorationSet {
  /** tile -> [meshIndex, instanceIndex][] */
  private tileInstances = new Map<number, [number, number][]>()
  private hidden = new Set<number>()
  private zero = new THREE.Matrix4().makeScale(0, 0, 0)
  private restore = new THREE.Matrix4()

  readonly meshes: THREE.InstancedMesh[]
  private originals: Float32Array[]

  constructor(meshes: THREE.InstancedMesh[], originals: Float32Array[], tileOf: number[][]) {
    this.meshes = meshes
    this.originals = originals
    tileOf.forEach((tilesForMesh, mi) => {
      tilesForMesh.forEach((ti, ii) => {
        let list = this.tileInstances.get(ti)
        if (!list) this.tileInstances.set(ti, (list = []))
        list.push([mi, ii])
      })
    })
  }

  /** Hide (frozen) or restore a tile's decorations. */
  setTileHidden(ti: number, hide: boolean) {
    if (hide === this.hidden.has(ti)) return
    const list = this.tileInstances.get(ti)
    if (!list) return
    if (hide) this.hidden.add(ti)
    else this.hidden.delete(ti)
    for (const [mi, ii] of list) {
      const mesh = this.meshes[mi]
      if (hide) {
        mesh.setMatrixAt(ii, this.zero)
      } else {
        this.restore.fromArray(this.originals[mi], ii * 16)
        mesh.setMatrixAt(ii, this.restore)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}

/**
 * One InstancedMesh per decoration kind. Instances sit on tile tops with
 * seeded jitter inside the tile, oriented along the tile normal.
 */
export function buildDecorations(tiles: Tile[], infos: TileInfo[], seed: string): DecorationSet {
  const rng = subRng(seed, 'deco')
  const placements: Record<DecorationKind, THREE.Matrix4[]> = { tree: [], rock: [], cactus: [] }
  const placementTiles: Record<DecorationKind, number[]> = { tree: [], rock: [], cactus: [] }

  const up = new THREE.Vector3(0, 1, 0)
  const quat = new THREE.Quaternion()
  const spin = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()

  for (let ti = 0; ti < tiles.length; ti++) {
    const info = infos[ti]
    if (info.step < 0) continue
    const deco = BIOME_DEFS[info.biome].decoration
    if (!deco) continue
    if (rng() > deco.chance) continue

    const tile = tiles[ti]
    const topR = PlanetGen.topRadius(info.step)
    // Approximate tile in-radius (angular) for jitter placement.
    const tileAngle = tile.center.angleTo(tile.boundary[0]) * 0.55

    for (let i = 0; i < deco.count; i++) {
      const theta = rng() * Math.PI * 2
      const rad = Math.sqrt(rng()) * tileAngle
      // Offset the center within the tangent disc, then renormalize.
      const ref = Math.abs(tile.center.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const u = new THREE.Vector3().crossVectors(tile.center, ref).normalize()
      const v = new THREE.Vector3().crossVectors(tile.center, u)
      pos
        .copy(tile.center)
        .addScaledVector(u, Math.cos(theta) * rad)
        .addScaledVector(v, Math.sin(theta) * rad)
        .normalize()

      quat.setFromUnitVectors(up, pos)
      spin.setFromAxisAngle(up, rng() * Math.PI * 2)
      quat.multiply(spin)

      const s = 0.8 + rng() * 0.5
      scale.set(s, s, s)
      pos.multiplyScalar(topR)

      placements[deco.kind].push(new THREE.Matrix4().compose(pos.clone(), quat.clone(), scale.clone()))
      placementTiles[deco.kind].push(ti)
    }
  }

  const meshes: THREE.InstancedMesh[] = []
  const originals: Float32Array[] = []
  const tileOf: number[][] = []
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  for (const kind of Object.keys(placements) as DecorationKind[]) {
    const matrices = placements[kind]
    if (matrices.length === 0) continue
    const mesh = new THREE.InstancedMesh(GEOMETRY_BUILDERS[kind](), material, matrices.length)
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.name = `deco-${kind}`
    meshes.push(mesh)
    originals.push(new Float32Array(mesh.instanceMatrix.array))
    tileOf.push(placementTiles[kind])
  }
  return new DecorationSet(meshes, originals, tileOf)
}
