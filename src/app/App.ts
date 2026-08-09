import * as THREE from 'three'
import Stats from 'stats.js'
import { CONFIG } from '../config'
import { Planet, type PlanetOptions } from '../planet/Planet'
import { defaultMoonParams } from '../planet/moons'
import { createStars } from '../planet/stars'
import { createSun, type Sun } from '../planet/sun'
import { createOrbitLine } from '../planet/orbitLine'
import { PlanetCameraController } from '../camera/PlanetCameraController'

export class App {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: PlanetCameraController
  planet: Planet
  private sun: Sun | null = null
  private planetOrbitLine: THREE.LineLoop | null = null
  private stars: THREE.Points
  private hemi: THREE.HemisphereLight
  private stats = new Stats()
  private clock = new THREE.Clock()

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 80000)

    this.hemi = new THREE.HemisphereLight(0x9db4d4, 0x5a5344, 0.7)
    this.scene.add(this.hemi)

    this.stars = createStars(CONFIG.seed, 4000, 40000)
    this.scene.add(this.stars)

    CONFIG.moons = defaultMoonParams(CONFIG.seed)
    this.planet = new Planet({
      seed: CONFIG.seed,
      frequency: CONFIG.frequency,
      seaLevel: CONFIG.seaLevel,
    })
    this.scene.add(this.planet.group)
    this.rebuildSystem()

    this.controls = new PlanetCameraController(this.camera, this.renderer.domElement)
    this.controls.ground = this.planet
    this.controls.origin = this.planet.group.position

    this.stats.showPanel(0)
    document.body.appendChild(this.stats.dom)

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })

    this.renderer.setAnimationLoop(() => this.tick())
  }

  regenerate(opts: PlanetOptions) {
    // A new world seed re-rolls the moon set; gen-param tweaks keep it.
    if (opts.seed !== this.planet.gen.seed) CONFIG.moons = defaultMoonParams(opts.seed)
    this.planet.dispose()
    this.planet = new Planet(opts)
    this.scene.add(this.planet.group)
    // Star size scales with the planet radius, which the Planet constructor
    // just recomputed from the new frequency.
    this.rebuildSystem()
    this.controls.ground = this.planet
    this.controls.origin = this.planet.group.position
  }

  /** (Re)create the star and the planet's orbit line at the current scale. */
  rebuildSystem() {
    if (this.sun) {
      this.sun.group.traverse((obj) => {
        // Sprites share one global geometry — only dispose mesh geometry.
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => {
            if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose()
            m.dispose()
          })
        }
      })
      this.sun.group.removeFromParent()
    }
    if (this.planetOrbitLine) {
      this.planetOrbitLine.geometry.dispose()
      ;(this.planetOrbitLine.material as THREE.Material).dispose()
      this.planetOrbitLine.removeFromParent()
    }

    this.sun = createSun()
    this.scene.add(this.sun.group)
    this.planetOrbitLine = createOrbitLine(CONFIG.radius * CONFIG.orbit.orbitRadiusFactor)
    this.scene.add(this.planetOrbitLine)
  }

  private tick() {
    this.stats.begin()
    const dt = Math.min(this.clock.getDelta(), 0.05)

    // Orbit params are live: angle is the scrubbable state, radius derives
    // from the factor each frame (the orbit line is a unit circle, rescaled).
    const tau = Math.PI * 2
    CONFIG.orbit.angle = (((CONFIG.orbit.angle + CONFIG.orbit.planetSpeed * dt) % tau) + tau) % tau
    const orbitRadius = CONFIG.radius * CONFIG.orbit.orbitRadiusFactor
    this.planetOrbitLine?.scale.setScalar(orbitRadius)
    this.planet.group.position.set(
      Math.cos(CONFIG.orbit.angle) * orbitRadius,
      0,
      Math.sin(CONFIG.orbit.angle) * orbitRadius,
    )
    this.planet.update(dt)

    this.controls.update(dt)

    // Depth precision: with a fixed near of 0.5 the buffer can't separate the
    // planet's sub-unit layers (ocean/seafloor/terrain steps) from far away —
    // they z-fight. Scale near with zoom distance instead.
    const near = THREE.MathUtils.clamp(this.controls.currentDistance * 0.02, 0.5, 600)
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.05) {
      this.camera.near = near
      this.camera.updateProjectionMatrix()
    }

    this.renderer.render(this.scene, this.camera)
    this.stats.end()
  }
}
