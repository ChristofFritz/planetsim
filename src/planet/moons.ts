import * as THREE from 'three'
import { CONFIG, type MoonParams } from '../config'
import { seededNoise3D, fbm } from '../gen/noise'
import { subRng } from '../gen/rng'
import { buildHexsphere } from './hexsphere'
import { edgeNeighbor } from './terrainMesh'
import { createOrbitLine } from './orbitLine'
import { applyPlanetDayMask } from './planetShading'

const MOON_STEPS = 6
const SIDE_DARKEN = 0.68
const LOW_COLOR = new THREE.Color(0x6f6b64)
const HIGH_COLOR = new THREE.Color(0xd2cec5)

/** Roll the default moon set for a world seed (same distribution as always). */
export function defaultMoonParams(seed: string): MoonParams[] {
  const rng = subRng(seed, 'moons')
  const count = 1 + (rng() < 0.4 ? 1 : 0)
  const moons: MoonParams[] = []
  for (let m = 0; m < count; m++) {
    moons.push({
      seed: `${seed}-moon${m}`,
      frequency: 12,
      radiusFactor: 0.1 + rng() * 0.08,
      orbitFactor: 2.6 + rng() * 1.4,
      inclination: (rng() - 0.5) * 0.12,
      node: rng() * Math.PI * 2,
      speed: -(0.02 + rng() * 0.03),
      phase: rng() * Math.PI * 2,
    })
  }
  return moons
}

/** A real hexsphere body: quantized fbm elevation, gray rock ramp, cliff walls. */
function buildMoonTerrain(params: MoonParams, radius: number): THREE.Mesh {
  const tiles = buildHexsphere(params.frequency)
  const noise = seededNoise3D(params.seed, 'moonterrain')
  const rng = subRng(params.seed, 'mooncolor')
  const stepH = radius * 0.045
  const baseR = radius - stepH

  const steps = tiles.map((t) => {
    const e = THREE.MathUtils.clamp(fbm(noise, t.center, 4, 2.2) * 0.5 + 0.5, 0, 1)
    return Math.min(MOON_STEPS - 1, Math.floor(e * MOON_STEPS))
  })
  const topR = (s: number) => radius + s * stepH

  const positions: number[] = []
  const colors: number[] = []
  const top = new THREE.Color()
  const side = new THREE.Color()
  const edgeMid = new THREE.Vector3()
  const pushTri = (a: THREE.Vector3, ra: number, b: THREE.Vector3, rb: number, c: THREE.Vector3, rc: number, col: THREE.Color) => {
    positions.push(a.x * ra, a.y * ra, a.z * ra, b.x * rb, b.y * rb, b.z * rb, c.x * rc, c.y * rc, c.z * rc)
    for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b)
  }

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]
    const step = steps[ti]
    const r = topR(step)
    const n = tile.boundary.length
    top.lerpColors(LOW_COLOR, HIGH_COLOR, step / (MOON_STEPS - 1)).multiplyScalar(0.93 + rng() * 0.14)
    side.copy(top).multiplyScalar(SIDE_DARKEN)

    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n
      pushTri(tile.center, r, tile.boundary[k], r, tile.boundary[k1], r, top)
      const neighborStep = steps[edgeNeighbor(tiles, tile, k, edgeMid)]
      if (neighborStep >= step) continue
      const bottomR = neighborStep === 0 ? baseR : topR(neighborStep)
      const p = tile.boundary[k]
      const q = tile.boundary[k1]
      pushTri(p, r, p, bottomR, q, bottomR, side)
      pushTri(p, r, q, bottomR, q, r, side)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
}

/**
 * One moon. Orbit params are read live from its MoonParams every frame, so
 * GUI sliders need no rebuild; only seed/frequency/radiusFactor (the terrain
 * itself) require recreating the body. `params.phase` is the live anomaly —
 * it advances with `speed` and can be scrubbed from the GUI.
 */
export class MoonBody {
  readonly pivot = new THREE.Object3D()
  private spinner = new THREE.Object3D()
  private mesh: THREE.Mesh
  private line: THREE.LineLoop
  private params: MoonParams
  private center = { value: new THREE.Vector3() }

  constructor(params: MoonParams) {
    this.params = params
    const radius = CONFIG.radius * params.radiusFactor
    this.mesh = buildMoonTerrain(params, radius)
    // Same analytic self-shadowing as the planet, around the moon's own center.
    applyPlanetDayMask(this.mesh.material as THREE.Material, {
      uPlanetCenter: this.center,
      uSunPos: { value: new THREE.Vector3(0, 0, 0) },
    })
    this.spinner.add(this.mesh)
    this.line = createOrbitLine(1)
    this.pivot.add(this.spinner, this.line)
    this.pivot.name = `moon:${params.seed}`
    this.update(0)
  }

  update(dt: number) {
    const p = this.params
    const tau = Math.PI * 2
    p.phase = (((p.phase + p.speed * dt) % tau) + tau) % tau
    this.pivot.rotation.y = p.node
    this.pivot.rotation.z = p.inclination
    this.spinner.rotation.y = p.phase
    const orbitR = CONFIG.radius * p.orbitFactor
    this.mesh.position.set(orbitR, 0, 0)
    this.mesh.rotation.y = p.phase * 3
    this.line.scale.setScalar(orbitR)
    this.mesh.getWorldPosition(this.center.value)
  }
}
