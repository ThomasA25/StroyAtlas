import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { emptyProject, type Project } from './model';
import { extractionContract } from './contract';
import { mergeExtractionInto, nextOrderOffset } from '../extraction/from-extraction';
import { factionConflicts, characterDeaths } from './derive';

/**
 * The German House of the Dragon dataset must load through the exact same app
 * pipeline as the English one and yield the same structure (ids are identical;
 * only human-readable text and proper nouns differ). This guards the per-locale
 * data against drift — a missing/extra entity or a broken id reference here
 * would desync the German seed from the English one.
 */
const EN_DIR = path.resolve(process.cwd(), 'data/hotd/episodes');
const DE_DIR = path.resolve(process.cwd(), 'data/hotd/de/episodes');

function loadAndMerge(dir: string): Project {
	const project = emptyProject();
	const files = readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort();
	for (const file of files) {
		const raw = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
		const result = extractionContract.parse(raw);
		mergeExtractionInto(project, result, { orderOffset: nextOrderOffset(project) });
	}
	return project;
}

describe('House of the Dragon — German dataset', () => {
	it('has one German file per English episode', () => {
		const en = readdirSync(EN_DIR).filter((f) => f.endsWith('.json')).sort();
		const de = readdirSync(DE_DIR).filter((f) => f.endsWith('.json')).sort();
		expect(de).toEqual(en);
	});

	it('every German episode file passes the Zod extraction contract', () => {
		for (const file of readdirSync(DE_DIR).filter((f) => f.endsWith('.json'))) {
			const raw = JSON.parse(readFileSync(path.join(DE_DIR, file), 'utf8'));
			expect(() => extractionContract.parse(raw)).not.toThrow();
		}
	});

	it('merges to the same entity/scene/event counts as the English dataset', () => {
		const en = loadAndMerge(EN_DIR);
		const de = loadAndMerge(DE_DIR);
		expect(Object.keys(de.events)).toHaveLength(Object.keys(en.events).length);
		expect(Object.keys(de.scenes)).toHaveLength(Object.keys(en.scenes).length);
		expect(Object.keys(de.characters)).toHaveLength(Object.keys(en.characters).length);
		expect(Object.keys(de.locations)).toHaveLength(Object.keys(en.locations).length);
	});

	it('uses the German faction labels and germanized location names', () => {
		const de = loadAndMerge(DE_DIR);
		const factions = new Set(factionConflicts(de).flatMap((c) => [c.factionA, c.factionB]));
		expect(factions.has('Grüne')).toBe(true);
		expect(factions.has('Schwarze')).toBe(true);
		// Germanized place/character names made it through the pipeline. (Canonical
		// ids are derived from the name slug, so we assert on names, not ids.)
		const locationNames = Object.values(de.locations).map((l) => l.name);
		expect(locationNames).toContain('Königsmund');
		expect(locationNames).toContain('Drachenstein');
		const charNames = Object.values(de.characters).map((c) => c.name);
		expect(charNames).toContain('Rhaenyra Targaryen');
	});

	it('places every location on the base map (non-null coordinates)', () => {
		const de = loadAndMerge(DE_DIR);
		expect(
			Object.values(de.locations).every((l) => l.coordinates.x != null && l.coordinates.y != null)
		).toBe(true);
		const koenigsmund = Object.values(de.locations).find((l) => l.name === 'Königsmund');
		expect(koenigsmund?.coordinates).toEqual({ x: 620, y: 620 });
	});

	it('records the same character deaths as the English dataset, at German locations', () => {
		const de = loadAndMerge(DE_DIR);
		const deaths = characterDeaths(de);
		expect(deaths.size).toBe(19);
		const luke = [...deaths.values()].find((d) => (d.characterId as string) === 'lucerys-velaryon');
		expect(de.locations[luke!.locationId as keyof typeof de.locations]?.name).toBe('Sturmkap');
	});
});
