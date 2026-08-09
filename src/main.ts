import './style.css'
import { App } from './app/App'
import { createDebugGui } from './ui/debug'

const container = document.getElementById('app')!
const app = new App(container)
createDebugGui(app)

// Handy for poking around in the console.
;(window as unknown as { app: App }).app = app
