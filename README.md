# planetsim

A procedurally generated hex-tile planet system in the browser: a star, an
orbiting planet built from a Goldberg polyhedron, hexsphere moons, and a
physically based atmosphere — every parameter editable live in the UI,
Factorio-style. TypeScript + Vite + Three.js, zero assets: all geometry is
generated in code, low-poly and flat-shaded.

**Live demo:** https://christoffritz.github.io/planetsim/

## Features

- **Hexsphere terrain** — Goldberg polyhedron GP(f,0) with `10f² + 2` tiles
  (up to ~207k at f=144), seeded simplex-fbm elevation/moisture/temperature
  mapped to Whittaker-style biomes, quantized height steps with culled cliff
  walls, merged into a single vertex-colored mesh.
- **Solar system** — the planet orbits a glowing star; moons are real
  hexsphere bodies with their own seeds, orbiting in near-ecliptic planes;
  faint orbit lines throughout.
- **Atmosphere** — single-scattering Rayleigh + Mie, ray-marched in a GLSL3
  shader; works from orbit and from inside the atmosphere. Sunset colors at
  the terminator fall out of the physics.
- **Analytic day/night** — no shadow maps; a terminator mask in the material
  shaders keeps the star from lighting night-side cliff walls.
- **One camera, space to ground** — orbit view far out blends into
  Anno-style surface flight up close, with sphere-safe parallel-transport
  heading (no pole singularities).
- **Everything tweakable** — seed, terrain shape, noise stacks, biome
  thresholds, atmosphere physics, orbits, and per-moon parameters, all in a
  lil-gui panel with live updates where no rebuild is needed.

## Controls

| Input | Action |
|---|---|
| Left drag / WASD | Pan across the surface |
| Right drag / Q, E | Rotate view |
| Scroll / R, F | Zoom (space ↔ ground) |

## Development

```sh
npm install
npm run dev    # http://localhost:5173
npm run build  # typecheck + production build to dist/
```

Deploys to GitHub Pages automatically on every push to `main`
(`.github/workflows/deploy.yml`).

## License

[MIT](LICENSE)
