import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Worker (src/server.ts) and the UI (src/app, TanStack Start), built
// together. `vite build --mode staging` builds for wrangler's staging env.
// The only static files are the UI's own bundles: nothing else in the repo
// is served.
export default defineConfig(({ mode }) => {
  if (mode === 'staging') process.env.CLOUDFLARE_ENV = 'staging'
  return {
    publicDir: false,
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tanstackStart({ srcDirectory: 'src/app' }),
      viteReact(),
    ],
  }
})
