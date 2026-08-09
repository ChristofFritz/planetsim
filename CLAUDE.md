# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

planetsim — a procedurally generated hex-tile planet system (star, planet, hexsphere moons, physical atmosphere) you can view from space or fly over Anno-style, with every parameter editable in the GUI. TypeScript + Vite + Three.js, no assets — all geometry generated in code, low-poly flat-shaded.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run build` — typecheck (`tsc`) + production build
- `npx tsc --noEmit` — typecheck only
- No test framework yet.

Note: tsconfig has `erasableSyntaxOnly` — no TS enums or constructor parameter properties (use `const ... as const` objects and explicit field assignment).

## Architecture

Everything derives deterministically from a string seed. `src/gen/` is the pure layer (no rendering): `PlanetGen` samples elevation/moisture/temperature via seeded simplex fbm on unit-sphere points and maps them to biomes (`biomes.ts`) and quantized height steps. Because terrain, decorations, and the camera ground-clamp all call the same `PlanetGen`, they always agree — there is no raycasting anywhere.

- `src/planet/hexsphere.ts` — Goldberg polyhedron GP(f,0): icosahedron → subdivide with frequency `f` → dualize. Yields `10f²+2` tiles; 12 are pentagons, so ALL downstream code must be polygon-count agnostic (iterate `tile.boundary.length`, never assume 6). Tile centers/boundaries are unit vectors; scale by radius at render time.
- `src/planet/terrainMesh.ts` — all land tiles merged into ONE non-indexed vertex-colored BufferGeometry (hard edges via computeVertexNormals on duplicated verts). Ocean tiles emit no geometry; the ocean is a smooth sphere (`ocean.ts`) plus an opaque inner seafloor sphere — without the seafloor the hollow planet is visible through the transparent water.
- `src/camera/PlanetCameraController.ts` — custom controller (not OrbitControls). State is `{focus, heading, distance, pitch}` where `focus` is a unit vector on the sphere and `heading` a tangent "forward". Sphere-safe "up" via parallel transport: every quaternion applied to `focus` is also applied to `heading`. Behavior blends by altitude (`blend()`): space orbit far out, free ground flight near the surface.
- `src/planet/Planet.ts` — builds/owns the whole planet group; `App.regenerate()` disposes and rebuilds it (GUI in `src/ui/debug.ts` drives this).
- Tunables (frequency, sea level, step heights, camera limits) live in `src/config.ts`. `CONFIG.radius` is DERIVED (`frequency * TILE_SCALE`, mutated by the `Planet` constructor) so tiles keep a constant world size — camera distances use radius-relative factors, never absolute values.
- `terrainMesh.ts` culls hidden cliff walls (only emitted where the neighbor tile is lower, down to the neighbor's top) — required to keep high frequencies (~92k tiles at f=96) under control.

## Notes

- The game/sim layer (agents, settlements, monuments, freeze cycle) was removed 2026-08 — currently a pure planet viewer. Tile point-location survives as `src/planet/tileLocator.ts` (neighbor hill-climb; NEVER raycast the 2M-tri terrain mesh — no BVH, 50–100ms per cast).
- Solar system: the star sits at scene origin (`sun.ts`: emissive sphere + glow sprite + PointLight with decay 0); the planet group is translated along a circular orbit each frame in `App.tick`. The camera controller works entirely in planet-local space and applies `controls.origin` (a live reference to `planet.group.position`) as a final offset — keep it that way. Lighting is physical now (day/night side from the star); the hemisphere light is the dark-side fill.
- Atmosphere (`atmosphere.ts`): single-scattering Rayleigh+Mie ray-march on an oversized BackSide shell (GLSL3 ShaderMaterial, additive, depthTest off — occlusion is done by clamping the march at the ground sphere). ALL params live in `CONFIG.atmosphere` and are synced to uniforms every frame, so GUI tweaks need no rebuild.
- Moons (`moons.ts`) are real hexsphere bodies (own seed/frequency, quantized fbm elevation, gray ramp, same day-mask shading) driven by editable `CONFIG.moons: MoonParams[]`. Orbit fields (orbitFactor/inclination/node/speed/phase) are read live every frame — `phase` and `CONFIG.orbit.angle` ARE the live sim state (GUI scrubs them via `.listen()`); body fields (seed/frequency/radiusFactor) need `Planet.rebuildMoons()`. A new world seed re-rolls `CONFIG.moons` (in `App.regenerate`); gen-param tweaks preserve user edits. Orbit lines are unit circles — rescale `line.scale`, never rebuild. Star size derives from `CONFIG.radius`, so `App.rebuildSystem()` runs on regenerate.

## Verification

No browser extension needed: `scratchpad` pattern — run dev server, then screenshot headlessly with puppeteer-core pointed at system Chrome (`/Applications/Google Chrome.app/...`). A hexsphere/procgen sanity check can be run by loading modules through `vite.createServer().ssrLoadModule` (plain `node --experimental-strip-types` fails on extensionless imports).
