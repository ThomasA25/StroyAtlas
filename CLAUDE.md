# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StoryAtlas — a SvelteKit SPA that turns serialized fiction (currently *House of the Dragon*) into an
explorable map/timeline atlas. It has two roles for the same codebase:

- **Editor** (`/`, dev-only): paste source text, run an LLM extraction pass, and hand-edit the
  resulting characters/locations/events/scenes. A dedicated **map editor** (`/editor`, dev-only)
  places locations on the base map and exports their coordinates for deployment.
- **Viewer** (`/map`): the published, read-only experience — animated character movement on a
  fictional base map with a synced timeline of key events.

It is frontend-only: no backend. Data lives in the browser (IndexedDB via Dexie); the user supplies
their own Anthropic API key for extraction (stored in `localStorage`, see
[keystore.ts](src/lib/extraction/keystore.ts)).

## Commands

```
npm run dev            # vite dev server
npm run build           # production build (adapter-static -> build/)
npm run preview         # serve the production build locally
npm run check           # svelte-kit sync + svelte-check (type checking)
npm run check:watch     # same, in watch mode
npm run test            # vitest run (all *.spec.ts)
npm run test:watch      # vitest in watch mode
```

Run a single test file: `npx vitest run src/lib/core/derive.spec.ts`
Run a single test by name: `npx vitest run -t "test name substring"`

Tests are colocated `*.spec.ts` files next to the code they cover (no separate `tests/` tree).

## Architecture

### Data flow: contract -> model -> derive -> store -> UI

- [contract.ts](src/lib/core/contract.ts) — the Zod schema for the **LLM extraction boundary**
  (snake_case, mirrors the JSON schema sent to Claude as structured output). This is the only
  place that shape is allowed to be untrusted; `extractionContract.parse(...)` is the gate.
- [model.ts](src/lib/core/model.ts) — the canonical, camelCase, branded-ID **Single Source of
  Truth** (`Project`). Entities (`characters`, `locations`, `events`, `scenes`, `sources`) are
  stored as by-id `Record`s, not arrays, for O(1) CRUD. Everything the UI shows either lives here
  or is derived from here.
- [from-extraction.ts](src/lib/extraction/from-extraction.ts) — maps a validated
  `ExtractionResult` into the canonical model and **merges** it into a `Project` in place. Entity
  resolution (matching a new "King's Landing" to an existing one) is deliberately light: normalized
  name/alias/id matching, not fuzzy dedup. Every produced entity is tagged `origin: 'extracted'` vs
  `'manual'` — this only records provenance, nothing is read-only because of it.
- [derive.ts](src/lib/core/derive.ts) + [playback.ts](src/lib/core/playback.ts) — pure functions
  computing everything that is *not* persisted: movement edges, timeline ordering, episode
  grouping, faction conflicts (co-occurrence in events, allegiance resolved per-event via
  `factionAt`), heuristic "key events" (keyword-matched death/battle/politics, en+de), deaths (from
  `StoryEvent.deaths`/`deathDetails`), concurrent storylines (same `orderIndex`), and map waypoint
  interpolation. All pure `Project -> data`, unit-tested without a browser.
- [store.svelte.ts](src/lib/core/store.svelte.ts) — `StoryStore`, a Svelte 5 class with a single
  deep-reactive `project = $state<Project>()` plus `$derived` getters wrapping every function in
  `derive.ts`. CRUD methods (`upsertX` / `removeX`) keep references consistent (e.g. removing a
  location nulls it out of any event/scene) so derived views never see dangling ids. `store` is an
  app-wide singleton; tests instantiate `StoryStore` directly.
- [persistence.ts](src/lib/core/persistence.ts) — `ProjectRepository` interface over Dexie
  (IndexedDB), single-row storage (whole project as one document). `+layout.svelte` debounce-saves
  `$state.snapshot(store.project)` 500ms after any change and loads on mount.
- [serialization.ts](src/lib/core/serialization.ts) — JSON export/import (the backup/exchange
  format) plus schema-version migrations (`CURRENT_SCHEMA_VERSION` in model.ts). Add a migration
  function to the `migrations` map, keyed by source version, when the model shape changes.

### IDs

[ids.ts](src/lib/core/ids.ts) brands every entity id type (`CharacterId`, `LocationId`,
`EventId`, `SceneId`, `SourceId`) so, e.g., a `SceneId` can't be assigned where an `EventId` is
expected — a compile-time-only constraint (plain strings at runtime). Only use the `asXId(...)`
helpers to mint one from a raw string. IDs are deterministic slugs (`slug()`) derived from a seed
name so the same entity resolves to the same id across sources.

### Extraction pipeline (dev-only feature)

[client.ts](src/lib/extraction/client.ts) `runExtraction()`: splits source text into paragraph-safe
chunks ([chunk.ts](src/lib/extraction/chunk.ts), ~12k chars), and for each chunk: collects already-known
entities (so later chunks reuse earlier ids), calls Claude with structured output
(`output_config.format: json_schema`, schema built by [schema.ts](src/lib/extraction/schema.ts) from
the same Zod contract), validates the response through `extractionContract.parse`, then merges it
into the project with an increasing `orderOffset` so chunks stack sequentially on the timeline.
Model/token constants live at the top of `client.ts`. [prompt.ts](src/lib/extraction/prompt.ts) holds
the system prompt and the "known entities" reuse instructions — extraction is grounded strictly in
source text, never invents facts.

### Seeded default dataset

[hotd-default.ts](src/lib/core/hotd-default.ts) builds the shipped *House of the Dragon* dataset by
running the real extraction pipeline over bundled episode JSON files
(`data/hotd/episodes/*.json`, German translations under `data/hotd/de/`, eagerly globbed at build
time — see `data/hotd/_manifest.json` for dataset provenance/coverage/gaps) — i.e. it exercises the
same `mergeExtractionInto` path as a live LLM extraction would, so no separate seeding logic exists.
On top of that it layers dataset-specific enrichment that is out of scope for the generic model:
dragons riding along with their riders (`DRAGONS`), the Blacks/Greens allegiance split that only
crystallizes at the S1E9 coronation (modeled as a per-character `AllegianceChange`, not a special
case), and per-death killer/cause/weapon detail (`DEATH_DETAILS`). `+layout.svelte` seeds this
dataset whenever there's no saved project, the saved project is empty, or it's still an untouched
default (`isHotdDefault`) — real user edits are never overwritten.

### Reactive state pattern (Svelte 5)

Feature state lives in small `.svelte.ts` classes using runes directly (no stores): `store`
([store.svelte.ts](src/lib/core/store.svelte.ts)), `clock`
([clock.svelte.ts](src/lib/core/clock.svelte.ts), the single playback-position source the map and
timeline animate from in lockstep), `layout` ([layout.svelte.ts](src/lib/core/layout.svelte.ts), per-board
drag/resize panel layout, persisted to `localStorage`), `i18n`
([i18n.svelte.ts](src/lib/i18n/i18n.svelte.ts)). Follow this pattern (a class with `$state` fields
and plain methods, exported as a singleton instance) for new cross-cutting state rather than
introducing a different state-management approach.

### Routing / dual-mode build

[env.ts](src/lib/core/env.ts): `EDIT_MODE = import.meta.env.DEV` gates every data-authoring surface.
`vite dev` (local) is the full editor; `vite build`/`vite preview` (what Netlify ships) is
read-only. `/` redirects to `/map` when not in edit mode ([+page.ts](src/routes/+page.ts)). The app
is SSR/prerender-disabled everywhere ([+layout.ts](src/routes/+layout.ts)) since it depends on
browser-only APIs (IndexedDB, the Anthropic SDK, three.js/Threlte) — adapter-static ships a single
`index.html` fallback so client-side routing handles everything (see
[netlify.toml](netlify.toml)/[svelte.config.js](svelte.config.js)).

### i18n

Two locales (`en`, `de`; German is default) via [messages.ts](src/lib/i18n/messages.ts) +
`i18n.svelte.ts`. The seeded dataset itself is bilingual at the data level
(`data/hotd/episodes/` vs `data/hotd/de/episodes/`), not translated on the fly.

## Conventions

- Tabs, single quotes, no trailing commas, 100-char width, no semicolons implied by editorconfig —
  formatting is enforced by Prettier (`.prettierrc`); the Svelte plugin is included, so don't
  hand-format `.svelte` files differently.
- Every mutable entity has explicit `origin: 'extracted' | 'manual'` — set it correctly on any new
  entity-creation path; never make behavior conditional on it beyond provenance display.
- Derived data (`derive.ts`, `playback.ts`) must stay pure and
  data-grounded — no invented facts, no heuristics beyond what's transparently documented (e.g. the
  keyword regexes for `keyEvents`). Add unit tests (`*.spec.ts`) alongside any new derivation.
