import * as THREE from 'three'

/** Faint circular orbit line in the local XZ plane, centered on the parent.
 *  Geometry is a UNIT circle scaled to `radius` — rescale `line.scale` to
 *  change the orbit radius live without rebuilding. */
export function createOrbitLine(radius: number, segments = 256): THREE.LineLoop {
  const positions = new Float32Array(segments * 3)
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    positions[i * 3] = Math.cos(a)
    positions[i * 3 + 2] = Math.sin(a)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color: 0x9fb4cc,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })
  const line = new THREE.LineLoop(geometry, material)
  line.scale.setScalar(radius)
  line.name = 'orbitLine'
  return line
}
