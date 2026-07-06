# StoryAtlas

StoryAtlas verwandelt serialisierte Fiction — aktuell *House of the Dragon* — in einen erkundbaren
Atlas: eine animierte Karte mit Figurenbewegung, eine synchronisierte Zeitleiste und einen
Beziehungsgraphen der Figuren. Die Story-Daten (Figuren, Orte, Ereignisse, Szenen) können manuell
gepflegt oder per LLM-Extraktion aus Quelltexten (Wiki, Transkript, Zusammenfassung) gewonnen
werden.

Die App ist ein reines Frontend (SvelteKit-SPA, kein Backend). Alle Daten liegen im Browser
(IndexedDB); für die Extraktion nutzt man den eigenen Anthropic-API-Key (lokal im Browser
gespeichert, nie an einen eigenen Server gesendet).

## Zwei Modi

- **Editor** (`/`, nur im Dev-Modus verfügbar): Quelltext einfügen, Extraktion laufen lassen und das
  Ergebnis von Hand nachbearbeiten (Figuren, Orte, Ereignisse, Szenen, Quellen).
- **Viewer** (`/map`, `/graph`): die veröffentlichte, read-only Ansicht — Karte mit Zeitleisten-
  Wiedergabe und Beziehungsgraph. Dies ist es, was der Produktions-Build (Netlify) ausliefert.

## Setup

```bash
npm install
npm run dev
```

Öffnet den Editor lokal unter `http://localhost:5173`. Für die LLM-Extraktion wird im Editor der
eigene Anthropic-API-Key hinterlegt (Panel "API-Schlüssel").

## Befehle

| Befehl                | Zweck                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`           | Dev-Server (Editor + Viewer, mit HMR)                          |
| `npm run build`         | Produktions-Build (`adapter-static` → `build/`)                |
| `npm run preview`       | Produktions-Build lokal servieren (read-only, wie Netlify)     |
| `npm run check`         | Typprüfung (`svelte-kit sync` + `svelte-check`)                |
| `npm run check:watch`   | Typprüfung im Watch-Modus                                      |
| `npm run test`          | Alle Tests (`vitest run`)                                      |
| `npm run test:watch`    | Tests im Watch-Modus                                           |

Einzelne Testdatei: `npx vitest run src/lib/core/derive.spec.ts`
Einzelner Test nach Name: `npx vitest run -t "teil des testnamens"`

## Datenfluss

```
Quelltext ──(LLM-Extraktion)──► Contract (Zod, snake_case) ──► Model (camelCase, branded IDs)
                                                                        │
                                                    ┌───────────────────┼───────────────────┐
                                                    ▼                   ▼                   ▼
                                                 Store            Persistence          Ableitungen
                                            (Svelte $state)     (IndexedDB/Dexie)   (Timeline, Karten-
                                                    │             + JSON-Export/       Bewegung, Faktions-
                                                    ▼                Import              konflikte, …)
                                                   UI
```

- **Contract** ([src/lib/core/contract.ts](src/lib/core/contract.ts)): das Zod-Schema an der
  LLM-Grenze — die einzige Stelle, an der die Form der Daten als nicht vertrauenswürdig gilt.
- **Model** ([src/lib/core/model.ts](src/lib/core/model.ts)): das kanonische Datenmodell (`Project`)
  mit branded IDs ([src/lib/core/ids.ts](src/lib/core/ids.ts)) — Single Source of Truth.
- **Store** ([src/lib/core/store.svelte.ts](src/lib/core/store.svelte.ts)): reaktiver
  Svelte-5-Zustand plus abgeleitete Ansichten (Bewegungen, Zeitleiste, Faktionskonflikte, Tode, …).
- **Persistence** ([src/lib/core/persistence.ts](src/lib/core/persistence.ts)): IndexedDB via
  Dexie; [src/lib/core/serialization.ts](src/lib/core/serialization.ts) für JSON-Export/Import inkl.
  Schema-Migration.

Details zu Architektur und Konventionen für die Weiterentwicklung: siehe [CLAUDE.md](CLAUDE.md).

## Datensatz

Der mitgelieferte Standarddatensatz (*House of the Dragon*, Staffel 1 bis S3E1) liegt unter
[data/hotd](data/hotd) — Episoden, Figuren- und Ortsregister, Beziehungen, zweisprachig (Englisch,
Deutsch unter `data/hotd/de/`). Herkunft, Abdeckung und bekannte Lücken sind in
[data/hotd/_manifest.json](data/hotd/_manifest.json) dokumentiert. Die Basiskarte (fiktives
Westeros) liegt unter `static/westeros.svg`; siehe [data/hotd/assets/README.md](data/hotd/assets/README.md)
zur Quelle.

## Tech-Stack

SvelteKit (`adapter-static`, SPA-Fallback) + TypeScript + Vite · Zod (Contract/Validierung) ·
Dexie (IndexedDB) · Leaflet (Karte) · Cytoscape (Beziehungsgraph) · Anthropic SDK (Extraktion) ·
Vitest (Tests). Deployment über Netlify ([netlify.toml](netlify.toml)).
