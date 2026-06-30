import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Frontend-only SPA: every route falls back to a single static page.
    // See src/routes/+layout.ts (ssr/prerender disabled).
    adapter: adapter({ fallback: 'index.html' }),
  },
}

export default config
