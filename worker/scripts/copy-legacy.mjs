// Copies the old UI (repo root index.html and js/, incl. the built rules
// bundle) into worker/.legacy, which Vite publishes as static files at /.
// Goes away at the cutover (UI-PORT.md, U9).
import { cpSync, rmSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const out = new URL('../.legacy/', import.meta.url)
rmSync(out, { recursive: true, force: true })
cpSync(new URL('index.html', root), new URL('index.html', out))
cpSync(new URL('js/', root), new URL('js/', out), { recursive: true })
