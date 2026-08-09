# Contributing

Thanks for your interest in planetsim!

## Setup

```sh
npm install
npm run dev
```

Requires Node 22+. No test framework yet — verify changes by running the app.

## Before opening a PR

- `npm run build` must pass (it typechecks with `tsc` before bundling).
- Keep the code style of the surrounding files; no new dependencies without
  discussion in an issue first.
- The project is deliberately asset-free: all geometry, textures, and colors
  are generated in code.

## Architecture ground rules

A few invariants that PRs should preserve (see `CLAUDE.md` for the full
picture):

- **Determinism** — everything derives from the string seed. `src/gen/` is a
  pure sampling layer with no rendering; terrain, decorations, and the camera
  ground-clamp must all agree by construction.
- **Polygon-count agnostic** — 12 of the tiles are pentagons. Iterate
  `tile.boundary.length`, never assume hexagons.
- **No terrain raycasts** — the merged terrain mesh has millions of
  triangles and no BVH. Picking and ground clamping go through `TileLocator`
  (neighbor hill-climb) instead.
- **Live vs. rebuild** — orbit and atmosphere parameters are read from
  `CONFIG` every frame and must stay rebuild-free; terrain/gen parameters
  apply on regenerate.
- **Tunables live in `src/config.ts`** — no magic numbers buried in modules,
  and camera/orbit distances are radius-relative factors, never absolute.

## Reporting bugs

Open an issue with the seed, the GUI parameters you changed, and what you
expected vs. saw. Screenshots help a lot.
