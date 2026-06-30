/**
 * Authoring (data-creation) UI is local-only.
 *
 * `vite dev` (running the app locally) sets `import.meta.env.DEV` to true; the
 * published `vite build` that Netlify ships sets it to false. Every data-creation
 * surface is gated on EDIT_MODE, so the production build is a read-only viewer
 * while local development keeps the full editor. `vite preview` is also a
 * production build, so it deliberately behaves like the published (read-only) site.
 */
export const EDIT_MODE = import.meta.env.DEV;
