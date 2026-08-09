import type * as THREE from 'three'
import type { Tile } from './hexsphere'

/**
 * Point-location by neighbor hill-climb: hop to whichever neighbor's center
 * is closer (bigger dot product) until a local max — on the Goldberg dual
 * that is the containing tile. A warm-start cache makes repeated queries
 * (mouse hover, camera clamp) a handful of hops.
 */
export class TileLocator {
  private lastHit = 0
  private tiles: Tile[]

  constructor(tiles: Tile[]) {
    this.tiles = tiles
  }

  tileAt(p: THREE.Vector3, warmStart = this.lastHit): number {
    let cur = warmStart
    let curDot = this.tiles[cur].center.dot(p)
    for (let guard = 0; guard < 2000; guard++) {
      let best = -1
      let bestDot = curDot
      for (const ni of this.tiles[cur].neighbors) {
        const d = this.tiles[ni].center.dot(p)
        if (d > bestDot) {
          bestDot = d
          best = ni
        }
      }
      if (best < 0) break
      cur = best
      curDot = bestDot
    }
    this.lastHit = cur
    return cur
  }
}
