import { describe, it, expect } from 'vitest';
import { emptyProject, CURRENT_SCHEMA_VERSION } from './model';
import { asCharacterId } from './ids';
import { exportProjectToJson, importProjectFromJson, migrateProject } from './serialization';

function sample() {
	const p = emptyProject();
	p.meta.series = 'Iron Thrones';
	const id = asCharacterId('ned');
	p.characters[id] = { id, name: 'Ned', faction: 'House Stark', aliases: [], origin: 'extracted' };
	return p;
}

describe('serialization round-trip', () => {
	it('exports and re-imports a project without loss', () => {
		const project = sample();
		const restored = importProjectFromJson(exportProjectToJson(project));
		expect(restored).toEqual(project);
		expect(restored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
	});
});

describe('importProjectFromJson validation', () => {
	it('rejects non-JSON', () => {
		expect(() => importProjectFromJson('{not json')).toThrow(/Invalid JSON/);
	});

	it('rejects a file missing a required map', () => {
		const broken = { schemaVersion: CURRENT_SCHEMA_VERSION, meta: {} };
		expect(() => migrateProject(broken)).toThrow(/missing "sources"/);
	});

	it('rejects a file from a newer schema version', () => {
		const future = {
			schemaVersion: CURRENT_SCHEMA_VERSION + 1,
			meta: {},
			sources: {},
			characters: {},
			locations: {},
			events: {},
			scenes: {}
		};
		expect(() => migrateProject(future)).toThrow(/newer/);
	});
});
