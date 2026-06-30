import { CURRENT_SCHEMA_VERSION, type Project } from './model';

/**
 * JSON export/import as the backup & exchange format, plus lightweight schema
 * versioning so older export files stay migratable.
 *
 * Pure (no browser/Dexie deps) so it is unit-testable in node and reusable by
 * both the file import/export UI and the persistence layer.
 */

export function exportProjectToJson(project: Project): string {
	return JSON.stringify(project, null, 2);
}

/** A migration upgrades a project object from version N to N+1. */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the source version: `migrations[1]` upgrades v1 → v2, etc.
 * Empty today (we are at v1). Add entries here as the model evolves.
 */
const migrations: Record<number, Migration> = {};

export function importProjectFromJson(text: string): Project {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('Invalid JSON: the file could not be parsed.');
	}
	return migrateProject(raw);
}

export function migrateProject(raw: unknown): Project {
	if (!isRecord(raw)) throw new Error('Project file is not an object.');
	let data = raw;
	let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

	while (version < CURRENT_SCHEMA_VERSION) {
		const migrate = migrations[version];
		if (!migrate) {
			throw new Error(`Cannot import: no migration from schema version ${version}.`);
		}
		data = migrate(data);
		version += 1;
		data.schemaVersion = version;
	}

	if (version > CURRENT_SCHEMA_VERSION) {
		throw new Error(
			`Project file is newer (v${version}) than this app supports (v${CURRENT_SCHEMA_VERSION}).`
		);
	}

	assertProjectShape(data);
	if (data.map === undefined) data.map = null; // tolerate files predating the map field
	return data as unknown as Project;
}

function assertProjectShape(data: Record<string, unknown>): void {
	if (!isRecord(data.meta)) throw new Error('Project file is missing "meta".');
	for (const key of ['sources', 'characters', 'locations', 'events', 'scenes'] as const) {
		if (!isRecord(data[key])) throw new Error(`Project file is missing "${key}".`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
