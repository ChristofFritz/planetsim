import * as THREE from 'three'
import { CONFIG } from '../config'
import type { GroundProvider } from '../planet/Planet'

/**
 * Single camera controller that blends by altitude:
 * far away it behaves like an orbit view of the whole planet, close to the
 * ground it becomes Anno-style flight (pan along the surface, tilt, rotate).
 *
 * "Up" on a sphere is handled by parallel transport: `heading` is a tangent
 * vector stored as state; every quaternion that rotates `focus` is also
 * applied to `heading`. No world-Y anywhere, so poles are not special.
 */
export class PlanetCameraController {
  /** Unit vector: the surface point the camera orbits. */
  private focus = new THREE.Vector3(0.4, 0.5, 1).normalize()
  /** Unit tangent vector at focus: view "forward" direction. */
  private heading: THREE.Vector3
  private distance = CONFIG.radius * CONFIG.camera.initialDistanceFactor
  private targetDistance = this.distance
  private pitch = 1.45
  private targetPitch = this.pitch

  /** Active pointers (mouse buttons held / fingers down), id -> last position. */
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private keys = new Set<string>()

  private readonly q = new THREE.Quaternion()
  private readonly axis = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  ground: GroundProvider | null = null
  /** World position of the planet center — the planet moves along its orbit.
   *  All controller math stays planet-local; this offset is applied last. */
  origin = new THREE.Vector3()
  /** Current distance from the focused surface point — drives LOD decisions. */
  get currentDistance(): number {
    return this.distance
  }

  private camera: THREE.PerspectiveCamera
  private dom: HTMLElement

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera
    this.dom = dom
    // Any tangent works as the initial heading.
    const ref = new THREE.Vector3(0, 1, 0)
    this.heading = new THREE.Vector3().crossVectors(this.focus, ref).normalize()
    this.bind()
  }

  private zoomBy(factor: number) {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * factor,
      CONFIG.camera.minDistance,
      CONFIG.radius * CONFIG.camera.maxDistanceFactor,
    )
  }

  private bind() {
    // Deltas are computed from stored positions, not e.movementX — touch
    // pointer events report no movement on some mobile browsers.
    this.dom.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.dom.setPointerCapture(e.pointerId)
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
    })
    const endPointer = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      this.pinchDist = 0
    }
    this.dom.addEventListener('pointerup', endPointer)
    this.dom.addEventListener('pointercancel', endPointer)
    this.dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY

      if (this.pointers.size === 2) {
        // Two fingers: pinch distance zooms, midpoint drag rotates (each
        // pointer contributes half its delta to the shared midpoint).
        const [a, b] = [...this.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.pinchDist > 0 && dist > 0) this.zoomBy(this.pinchDist / dist)
        this.pinchDist = dist
        this.rotate(-(dx / 2) * 0.005, (dy / 2) * 0.004)
      } else if (e.buttons & 2 || e.ctrlKey) {
        this.rotate(-dx * 0.005, dy * 0.004)
      } else {
        this.pan(dx, dy)
      }
    })
    this.dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoomBy(Math.exp(e.deltaY * 0.0012))
      },
      { passive: false },
    )
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', (e) => this.keys.add(e.code))
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  /** Move the orbit focus to a new surface point (unit vector). */
  setFocus(p: THREE.Vector3) {
    this.focus.copy(p).normalize()
    const ref = Math.abs(this.focus.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    this.heading.crossVectors(this.focus, ref).normalize()
  }

  /** Orbit-to-ground blend factor: 0 = ground flight, 1 = space orbit. */
  private blend(): number {
    return THREE.MathUtils.smoothstep(
      this.distance,
      CONFIG.camera.blendNear,
      CONFIG.radius * CONFIG.camera.blendFarFactor,
    )
  }

  /** Rotate focus (and heading — parallel transport) along tangent dir. */
  private moveFocus(tangentDir: THREE.Vector3, angle: number) {
    this.axis.crossVectors(this.focus, tangentDir).normalize()
    this.q.setFromAxisAngle(this.axis, angle)
    this.focus.applyQuaternion(this.q).normalize()
    this.heading.applyQuaternion(this.q)
    // Re-orthogonalize heading against drift.
    this.heading.addScaledVector(this.focus, -this.heading.dot(this.focus)).normalize()
  }

  /** Pan sensitivity scale: proportional to altitude near the surface, but
   *  capped once the whole planet is in view — otherwise a screen-width drag
   *  at far zoom whips the focus around the sphere several times. */
  private panDistance(): number {
    return Math.min(this.distance, CONFIG.radius * CONFIG.camera.panDistanceCapFactor)
  }

  private pan(dxPx: number, dyPx: number) {
    const right = this.tmp.crossVectors(this.heading, this.focus).normalize()
    // Grab-the-ground: the surface follows the cursor.
    const move = new THREE.Vector3()
      .addScaledVector(right, -dxPx)
      .addScaledVector(this.heading, dyPx)
    const px = Math.hypot(dxPx, dyPx)
    if (px < 1e-6) return
    move.normalize()
    const angle = (px * this.panDistance() * 0.0013) / CONFIG.radius
    this.moveFocus(move, angle)
  }

  private rotate(yaw: number, pitchDelta: number) {
    this.q.setFromAxisAngle(this.focus, yaw)
    this.heading.applyQuaternion(this.q).normalize()
    this.targetPitch += pitchDelta
  }

  update(dt: number) {
    // Keyboard: WASD pan, QE rotate, RF zoom.
    const panAngle = (1.2 * dt * this.panDistance()) / CONFIG.radius
    const right = new THREE.Vector3().crossVectors(this.heading, this.focus).normalize()
    if (this.keys.has('KeyW')) this.moveFocus(this.heading, panAngle)
    if (this.keys.has('KeyS')) this.moveFocus(this.heading.clone().negate(), panAngle)
    if (this.keys.has('KeyA')) this.moveFocus(right.clone().negate(), panAngle)
    if (this.keys.has('KeyD')) this.moveFocus(right, panAngle)
    if (this.keys.has('KeyQ')) this.rotate(1.5 * dt, 0)
    if (this.keys.has('KeyE')) this.rotate(-1.5 * dt, 0)
    if (this.keys.has('KeyR')) this.targetDistance *= Math.exp(-1.5 * dt)
    if (this.keys.has('KeyF')) this.targetDistance *= Math.exp(1.5 * dt)
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance,
      CONFIG.camera.minDistance,
      CONFIG.radius * CONFIG.camera.maxDistanceFactor,
    )

    // Damping.
    const damp = 1 - Math.exp(-8 * dt)
    this.distance += (this.targetDistance - this.distance) * damp

    // Altitude-dependent pitch clamp: free tilt near ground, top-down far out.
    const t = this.blend()
    const minPitch = THREE.MathUtils.lerp(0.28, 1.35, t)
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, minPitch, CONFIG.camera.maxPitch)
    this.pitch += (this.targetPitch - this.pitch) * damp

    // Place camera.
    const groundR = this.ground ? this.ground.groundRadius(this.focus) : CONFIG.radius
    const surfacePoint = this.tmp.copy(this.focus).multiplyScalar(groundR)
    const offset = new THREE.Vector3()
      .addScaledVector(this.heading, -Math.cos(this.pitch))
      .addScaledVector(this.focus, Math.sin(this.pitch))
    const camPos = new THREE.Vector3().copy(surfacePoint).addScaledVector(offset, this.distance)

    // Keep the camera above the terrain under it.
    if (this.ground) {
      const under = camPos.clone().normalize()
      const minR = this.ground.groundRadius(under) + 1.5
      if (camPos.length() < minR) camPos.setLength(minR)
    }

    this.camera.position.copy(camPos).add(this.origin)
    this.camera.up.copy(this.focus)
    this.camera.lookAt(surfacePoint.add(this.origin))
  }
}
