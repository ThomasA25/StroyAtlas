import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { emptyProject, type Project } from './model';
import { extractionContract } from './contract';
import { mergeExtractionInto, nextOrderOffset } from '../extraction/from-extraction';
import { exportProjectToJson, importProjectFromJson } from './serialization';
import {
	movementEdges,
	timelineScenes,
	factionConflicts,
	keyEvents,
	concurrentStorylines,
	characterDeaths
} from './derive';

/**
 * Test-load the House of the Dragon dataset through the REAL app pipeline:
 * contract gate (Zod) -> mergeExtractionInto (entity resolution + order offset,
 * exactly as runExtraction does) -> derived views -> JSON round-trip via the
 * app's own import/export. Set EMIT_HOTD=1 to also write the combined importable
 * project to data/hotd/hotd.project.json.
 */
const DATA_DIR = path.resolve(process.cwd(), 'data/hotd');
const EP_DIR = path.join(DATA_DIR, 'episodes');

function loadAndMerge(): Project {
	const project = emptyProject();
	project.meta = {
		series: 'House of the Dragon',
		season: null,
		episode: null,
		title: 'House of the Dragon (S1–S3E1)'
	};
	const files = readdirSync(EP_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort();
	for (const file of files) {
		const raw = JSON.parse(readFileSync(path.join(EP_DIR, file), 'utf8'));
		const result = extractionContract.parse(raw); // contract gate — throws on mismatch
		mergeExtractionInto(project, result, { orderOffset: nextOrderOffset(project) });
	}
	return project;
}

describe('House of the Dragon dataset — load via the app pipeline', () => {
	it('every episode file passes the Zod extraction contract', () => {
		const files = readdirSync(EP_DIR).filter((f) => f.endsWith('.json'));
		expect(files.length).toBe(19);
		for (const file of files) {
			const raw = JSON.parse(readFileSync(path.join(EP_DIR, file), 'utf8'));
			expect(() => extractionContract.parse(raw)).not.toThrow();
		}
	});

	it('merges into one project with deduped entities and stacked timeline', () => {
		const project = loadAndMerge();
		expect(Object.keys(project.events)).toHaveLength(96);
		expect(Object.keys(project.scenes)).toHaveLength(81);
		// Characters/locations dedup by slug across all 19 episodes.
		expect(Object.keys(project.characters).length).toBeGreaterThan(45);
		expect(Object.keys(project.locations).length).toBeGreaterThan(15);
		// Recurring entities collapsed to a single id.
		expect(project.characters['rhaenyra-targaryen' as keyof typeof project.characters]).toBeDefined();
		expect(project.locations['kings-landing' as keyof typeof project.locations]).toBeDefined();
		// Timeline order offsets stacked the episodes (last scene order >> per-episode max).
		const scenes = timelineScenes(project);
		expect(scenes[scenes.length - 1]!.orderIndex).toBeGreaterThan(70);
	});

	it('places every location on the base map (non-null coordinates)', () => {
		const project = loadAndMerge();
		const locs = Object.values(project.locations);
		expect(locs.length).toBeGreaterThan(0);
		expect(locs.every((l) => l.coordinates.x != null && l.coordinates.y != null)).toBe(true);
		expect(project.locations['kings-landing' as keyof typeof project.locations]?.coordinates).toEqual({
			x: 560,
			y: 620
		});
	});

	it('records explicit character deaths (when & where), excluding staged deaths', () => {
		const project = loadAndMerge();
		const deaths = characterDeaths(project);
		expect(deaths.size).toBe(19);
		const byChar = (id: string) =>
			[...deaths.values()].find((d) => (d.characterId as string) === id);
		const luke = byChar('lucerys-velaryon');
		expect(luke).toBeDefined();
		expect(project.locations[luke!.locationId as keyof typeof project.locations]?.name).toBe(
			"Storm's End"
		);
		// Laenor fakes his death and flees — it must NOT be recorded as a death.
		expect(byChar('laenor-velaryon')).toBeUndefined();
	});

	it('produces non-trivial derived views', () => {
		const project = loadAndMerge();
		expect(movementEdges(project).length).toBeGreaterThan(0);
		expect(factionConflicts(project).length).toBeGreaterThan(0);
		expect(keyEvents(project).length).toBeGreaterThan(0);
		// faction conflicts should include the central Greens vs Blacks clash
		const factions = new Set(factionConflicts(project).flatMap((c) => [c.factionA, c.factionB]));
		expect(factions.has('Greens')).toBe(true);
		expect(factions.has('Blacks')).toBe(true);
		// concurrency derivation runs without error (may be empty given offsets)
		expect(Array.isArray(concurrentStorylines(project))).toBe(true);
	});

	it('round-trips through the app import/export', () => {
		const project = loadAndMerge();
		const restored = importProjectFromJson(exportProjectToJson(project));
		expect(Object.keys(restored.events)).toHaveLength(96);
		expect(Object.keys(restored.scenes)).toHaveLength(81);
		expect(restored.meta.series).toBe('House of the Dragon');

		if (process.env.EMIT_HOTD) {
			const out = path.join(DATA_DIR, 'hotd.project.json');
			writeFileSync(out, exportProjectToJson(project), 'utf8');
		}
	});
});
