import * as THREE from 'three'
import { PlanetGen } from '../gen/planetData'

/** Opaque inner sphere: the planet is hollow, this keeps you from seeing through it under water. */
export function createSeafloor(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(PlanetGen.seaRadius() - 1.6, 64, 48)
  const material = new THREE.MeshLambertMaterial({ color: 0x274b66 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'seafloor'
  return mesh
}

export function createOcean(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(PlanetGen.seaRadius(), 192, 128)
  const material = new THREE.MeshStandardMaterial({
    color: 0x1d5d8f,
    transparent: true,
    opacity: 0.88,
    roughness: 0.42,
    metalness: 0.0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ocean'
  return mesh
}
