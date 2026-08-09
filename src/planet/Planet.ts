import * as THREE from 'three'
import { CONFIG, TILE_SCALE } from '../config'
import { PlanetGen, type TileInfo } from '../gen/planetData'
import { buildHexsphere, type Tile } from './hexsphere'
import { buildTerrainMesh, buildTileEdges, type TerrainBuild } from './terrainMesh'
import { createOcean, createSeafloor } from './ocean'
import { buildDecorations, type DecorationSet } from './decorations'
import { MoonBody } from './moons'
import { TileLocator } from './tileLocator'
import { applyPlanetDayMask, type PlanetShadingUniforms } from './planetShading'
import { Atmosphere } from './atmosphere'

export interface PlanetOptions {
  seed: string
  frequency: number
  seaLevel: number
}

export interface GroundProvider {
  groundRadius(p: THREE.Vector3): number
}

/** Builds and owns the whole planet scene graph (terrain, ocean, moons). */
export class Planet implements GroundProvider {
  readonly group = new THREE.Group()
  readonly gen: PlanetGen
  readonly tiles: Tile[]
  readonly infos: TileInfo[]
  readonly terrain: TerrainBuild
  readonly locator: TileLocator
  readonly decorations: DecorationSet
  readonly atmosphere: Atmosphere
  private moons: MoonBody[] = []
  /** Edge overlay is built lazily — at high frequencies it's a million vertices. */
  private edges: THREE.LineSegments | null = null

  constructor(opts: PlanetOptions) {
    // Radius scales with frequency so tiles keep a constant world size.
    CONFIG.radius = opts.frequency * TILE_SCALE
    CONFIG.frequency = opts.frequency
    this.gen = new PlanetGen(opts.seed, opts.seaLevel)

    const t0 = performance.now()
    this.tiles = buildHexsphere(opts.frequency)
    this.infos = this.tiles.map((t) => this.gen.tileInfo(t.center))
    this.locator = new TileLocator(this.tiles)

    // Fake sphere self-shadowing: the group's position is mutated in place as
    // the planet orbits, so the uniform reference stays live.
    const shading: PlanetShadingUniforms = {
      uPlanetCenter: { value: this.group.position },
      uSunPos: { value: new THREE.Vector3(0, 0, 0) },
    }

    this.terrain = buildTerrainMesh(this.tiles, this.infos, opts.seed)
    applyPlanetDayMask(this.terrain.mesh.material as THREE.Material, shading)
    this.group.add(this.terrain.mesh)

    this.group.add(createSeafloor())
    this.group.add(createOcean())

    this.decorations = buildDecorations(this.tiles, this.infos, opts.seed)
    for (const mesh of this.decorations.meshes) {
      applyPlanetDayMask(mesh.material as THREE.Material, shading)
      this.group.add(mesh)
    }

    this.atmosphere = new Atmosphere(this.group.position)
    this.group.add(this.atmosphere.mesh)

    this.rebuildMoons()
    console.log(
      `planet: ${this.tiles.length} tiles (f=${opts.frequency}, R=${CONFIG.radius.toFixed(0)}) in ${(performance.now() - t0).toFixed(0)}ms`,
    )
  }

  /** (Re)create all moon bodies from CONFIG.moons (seed/frequency/size edits). */
  rebuildMoons() {
    for (const moon of this.moons) {
      moon.pivot.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
      this.group.remove(moon.pivot)
    }
    this.moons = CONFIG.moons.map((p) => new MoonBody(p))
    for (const moon of this.moons) this.group.add(moon.pivot)
  }

  set edgesVisible(v: boolean) {
    if (v && !this.edges) {
      this.edges = buildTileEdges(this.tiles, this.infos)
      this.group.add(this.edges)
    }
    if (this.edges) this.edges.visible = v
  }

  /** Terrain (or sea) surface radius under a unit-direction point. */
  groundRadius(p: THREE.Vector3): number {
    const step = this.infos[this.locator.tileAt(p)].step
    if (step < 0) return PlanetGen.seaRadius()
    return PlanetGen.topRadius(step)
  }

  /** Advance visuals: moons, live atmosphere params. */
  update(dt: number) {
    for (const moon of this.moons) moon.update(dt)
    this.atmosphere.update()
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((m) => m.dispose())
      }
    })
    this.group.removeFromParent()
  }
}
