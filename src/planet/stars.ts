import * as THREE from 'three'
import { subRng } from '../gen/rng'

export function createStars(seed: string, count = 3000, radius = 1500): THREE.Points {
  const rng = subRng(seed, 'stars')
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform point on the sphere.
    const z = rng() * 2 - 1
    const phi = rng() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    positions[i * 3] = Math.cos(phi) * r * radius
    positions[i * 3 + 1] = z * radius
    positions[i * 3 + 2] = Math.sin(phi) * r * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
  })
  const stars = new THREE.Points(geometry, material)
  stars.name = 'stars'
  return stars
}
