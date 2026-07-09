// Frontend-only MVP: render as a static SPA.
// All data lives in the browser (IndexedDB) and views use browser-only libs
// (Anthropic SDK, Threlte/three.js, Cytoscape), so we disable SSR/prerender and ship a
// single fallback page (configured via adapter-static `fallback` in vite.config.ts).
export const ssr = false;
export const prerender = false;
