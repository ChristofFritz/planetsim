import { defineConfig } from 'vite'

// GitHub Pages serves the app under /planetsim/, so builds need that base;
// the dev server stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/planetsim/' : '/',
}))
