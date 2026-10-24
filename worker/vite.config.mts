import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Worker (src/server.ts) and the new UI (src/app, TanStack Start), built
// together. `vite build --mode staging` builds for wrangler's staging env.
// The new UI lives under /new/ until the cutover (UI-PORT.md, U9); the old
// UI's files (repo root index.html, js/) are copied into .legacy by
// scripts/copy-legacy.mjs and served as they are.
export default defineConfig(({ mode }) => {
  if (mode === 'staging') process.env.CLOUDFLARE_ENV = 'staging'
  return {
    publicDir: '.legacy',
    // The new UI's files sit under /new/ too, so they never clash with the
    // old UI's.
    build: { assetsDir: 'new/assets' },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tanstackStart({
        srcDirectory: 'src/app',
        router: { basepath: '/new' },
      }),
      viteReact(),
    ],
  }
})
