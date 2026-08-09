import GUI from 'lil-gui'
import { CONFIG, type MoonParams } from '../config'
import type { App } from '../app/App'

/**
 * Factorio-style map-gen GUI: every generation parameter is a slider bound
 * directly to CONFIG (which PlanetGen and the biome lookup read live), so a
 * rebuild is all it takes to apply changes.
 */
export function createDebugGui(app: App) {
  const genDefaults = structuredClone(CONFIG.gen)
  const atmoDefaults = structuredClone(CONFIG.atmosphere)
  const terrainDefaults = {
    heightSteps: CONFIG.heightSteps,
    stepHeight: CONFIG.stepHeight,
    landBaseHeight: CONFIG.landBaseHeight,
  }

  const params = {
    seed: CONFIG.seed,
    frequency: CONFIG.frequency as number,
    seaLevel: CONFIG.seaLevel as number,
    tileEdges: false,
    autoRegen: true,
    regenerate: () => rebuild(),
    randomSeed: () => {
      params.seed = Math.random().toString(36).slice(2, 10)
      seedCtrl.updateDisplay()
      rebuild()
    },
    resetDefaults: () => {
      for (const key of Object.keys(genDefaults) as (keyof typeof genDefaults)[]) {
        Object.assign(CONFIG.gen[key], genDefaults[key])
      }
      Object.assign(CONFIG, terrainDefaults)
      Object.assign(CONFIG.atmosphere, atmoDefaults)
      gui.controllersRecursive().forEach((c) => c.updateDisplay())
      rebuild()
    },
  }

  const rebuild = () => {
    const seedChanged = params.seed !== app.planet.gen.seed
    app.regenerate({ seed: params.seed, frequency: params.frequency, seaLevel: params.seaLevel })
    app.planet.edgesVisible = params.tileEdges
    if (seedChanged) rebuildMoonFolders() // new seed re-rolled the moon set
  }
  const onChange = () => {
    if (params.autoRegen) rebuild()
  }

  const gui = new GUI({ title: 'planetsim' })
  const seedCtrl = gui.add(params, 'seed').onFinishChange(onChange)
  gui.add(params, 'randomSeed')
  gui.add(params, 'autoRegen')
  gui.add(params, 'regenerate')
  gui.add(params, 'resetDefaults').name('reset gen defaults')
  gui.add(params, 'tileEdges').onChange((v: boolean) => (app.planet.edgesVisible = v))

  const terrain = gui.addFolder('Terrain')
  terrain.add(params, 'frequency', [24, 48, 96, 144]).onFinishChange(onChange)
  terrain.add(params, 'seaLevel', 0.3, 0.7, 0.01).onFinishChange(onChange)
  terrain.add(CONFIG, 'heightSteps', 4, 24, 1).onFinishChange(onChange)
  terrain.add(CONFIG, 'stepHeight', 0.2, 2, 0.05).onFinishChange(onChange)
  terrain.add(CONFIG, 'landBaseHeight', 0.5, 5, 0.1).onFinishChange(onChange)

  const elev = gui.addFolder('Elevation noise').close()
  const ge = CONFIG.gen.elevation
  elev.add(ge, 'continentOctaves', 1, 6, 1).onFinishChange(onChange)
  elev.add(ge, 'continentFreq', 0.2, 3, 0.05).onFinishChange(onChange)
  elev.add(ge, 'continentWeight', 0, 1.5, 0.05).onFinishChange(onChange)
  elev.add(ge, 'detailOctaves', 1, 8, 1).onFinishChange(onChange)
  elev.add(ge, 'detailFreq', 0.5, 6, 0.05).onFinishChange(onChange)
  elev.add(ge, 'detailWeight', 0, 1.5, 0.05).onFinishChange(onChange)
  elev.add(ge, 'lacunarity', 1.5, 3, 0.05).onFinishChange(onChange)
  elev.add(ge, 'gain', 0.2, 0.8, 0.02).onFinishChange(onChange)
  elev.add(ge, 'scale', 0.2, 1.5, 0.05).onFinishChange(onChange)
  elev.add(ge, 'bias', 0, 1, 0.02).onFinishChange(onChange)

  const moist = gui.addFolder('Moisture').close()
  const gm = CONFIG.gen.moisture
  moist.add(gm, 'octaves', 1, 8, 1).onFinishChange(onChange)
  moist.add(gm, 'freq', 0.5, 6, 0.05).onFinishChange(onChange)
  moist.add(gm, 'bias', -0.5, 0.5, 0.02).onFinishChange(onChange)

  const temp = gui.addFolder('Temperature').close()
  const gt = CONFIG.gen.temperature
  temp.add(gt, 'poleExponent', 0.5, 3, 0.05).onFinishChange(onChange)
  temp.add(gt, 'elevationCooling', 0, 1, 0.02).onFinishChange(onChange)
  temp.add(gt, 'offset', -0.5, 0.5, 0.02).onFinishChange(onChange)

  // Orbit params are read live every frame; only the star size needs a
  // system rebuild. angle/phase are the live sim state — scrubbable.
  const orbits = gui.addFolder('Orbits').close()
  orbits.add(CONFIG.orbit, 'starRadiusFactor', 0.5, 5, 0.1).onFinishChange(() => app.rebuildSystem())
  orbits.add(CONFIG.orbit, 'orbitRadiusFactor', 5, 40, 0.5)
  orbits.add(CONFIG.orbit, 'planetSpeed', 0, 0.05, 0.001)
  orbits.add(CONFIG.orbit, 'angle', 0, Math.PI * 2, 0.01).listen()

  const moonsFolder = gui.addFolder('Moons').close()
  const moonActions = {
    addMoon: () => {
      const i = CONFIG.moons.length
      CONFIG.moons.push({
        seed: `${params.seed}-moon${i}-${Math.random().toString(36).slice(2, 6)}`,
        frequency: 12,
        radiusFactor: 0.12,
        orbitFactor: 2.6 + i * 1.2,
        inclination: 0,
        node: Math.random() * Math.PI * 2,
        speed: -0.03,
        phase: Math.random() * Math.PI * 2,
      })
      app.planet.rebuildMoons()
      rebuildMoonFolders()
    },
  }
  const rebuildMoons = () => app.planet.rebuildMoons()
  let moonFolders: ReturnType<GUI['addFolder']>[] = []
  const rebuildMoonFolders = () => {
    moonFolders.forEach((f) => f.destroy())
    moonFolders = CONFIG.moons.map((m: MoonParams, i: number) => {
      const f = moonsFolder.addFolder(`Moon ${i + 1}`)
      // Body params — rebuild the moon meshes on change.
      f.add(m, 'seed').onFinishChange(rebuildMoons)
      f.add(m, 'frequency', [8, 12, 16, 24]).onFinishChange(rebuildMoons)
      f.add(m, 'radiusFactor', 0.04, 0.35, 0.005).onFinishChange(rebuildMoons)
      // Orbit params — live.
      f.add(m, 'orbitFactor', 1.5, 10, 0.05)
      f.add(m, 'inclination', -1.6, 1.6, 0.01)
      f.add(m, 'node', 0, Math.PI * 2, 0.01)
      f.add(m, 'speed', -0.15, 0.15, 0.001)
      f.add(m, 'phase', 0, Math.PI * 2, 0.01).listen()
      f.add({ remove: () => {
        CONFIG.moons.splice(i, 1)
        app.planet.rebuildMoons()
        rebuildMoonFolders()
      } }, 'remove')
      return f
    })
  }
  moonsFolder.add(moonActions, 'addMoon')
  rebuildMoonFolders()

  // Atmosphere params are synced to uniforms every frame — live, no rebuild.
  const atmo = gui.addFolder('Atmosphere').close()
  const ga = CONFIG.atmosphere
  atmo.add(ga, 'enabled')
  atmo.add(ga, 'height', 0.01, 0.3, 0.005)
  atmo.add(ga, 'rayleighScaleHeight', 0.002, 0.05, 0.001)
  atmo.add(ga, 'mieScaleHeight', 0.001, 0.02, 0.0005)
  atmo.add(ga, 'rayleighStrength', 0, 0.2, 0.001)
  atmo.add(ga, 'wavelengthR', 380, 780, 5)
  atmo.add(ga, 'wavelengthG', 380, 780, 5)
  atmo.add(ga, 'wavelengthB', 380, 780, 5)
  atmo.add(ga, 'mieStrength', 0, 0.02, 0.0005)
  atmo.add(ga, 'mieG', 0, 0.95, 0.01)
  atmo.add(ga, 'sunIntensity', 1, 60, 1)
  atmo.add(ga, 'exposure', 0.2, 4, 0.05)
  atmo.add(ga, 'samples', 4, 24, 1)
  atmo.add(ga, 'lightSamples', 2, 12, 1)

  const biomes = gui.addFolder('Biomes').close()
  const gb = CONFIG.gen.biomes
  biomes.add(gb, 'beachElev', 0, 0.2, 0.005).onFinishChange(onChange)
  biomes.add(gb, 'beachSnowTemp', 0, 0.5, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'mountainElev', 0.3, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'mountainSnowTemp', 0, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'snowTemp', 0, 0.5, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'tundraTemp', 0, 0.5, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'desertTemp', 0, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'desertMoisture', 0, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'rainforestMoisture', 0, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'rainforestTemp', 0, 1, 0.01).onFinishChange(onChange)
  biomes.add(gb, 'forestMoisture', 0, 1, 0.01).onFinishChange(onChange)

  return gui
}
