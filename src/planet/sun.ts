import * as THREE from 'three'
import { CONFIG } from '../config'

export interface Sun {
  group: THREE.Group
  light: THREE.PointLight
}

/** The star the planet orbits: emissive sphere + additive glow sprite + light. */
export function createSun(): Sun {
  const radius = CONFIG.radius * CONFIG.orbit.starRadiusFactor
  const group = new THREE.Group()
  group.name = 'sun'

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf }),
  )
  group.add(mesh)

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 236, 190, 1)')
  grad.addColorStop(0.25, 'rgba(255, 214, 130, 0.55)')
  grad.addColorStop(0.6, 'rgba(255, 180, 90, 0.12)')
  grad.addColorStop(1, 'rgba(255, 160, 60, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  )
  sprite.scale.setScalar(radius * 7)
  group.add(sprite)

  // decay 0: no distance falloff — the planet stays evenly lit along its orbit.
  const light = new THREE.PointLight(0xfff4e0, 2.6, 0, 0)
  group.add(light)

  return { group, light }
}
