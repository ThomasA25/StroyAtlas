import Dexie, { type Table } from 'dexie';
import type { Project } from './model';

/**
 * Persistence abstraction.
 *
 * The store talks to a `ProjectRepository`, never to Dexie directly. Today the
 * only implementation is IndexedDB (Dexie) so the project survives reloads; a
 * later phase can drop in an HTTP-backed implementation with no change to the
 * model or store. JSON import/export (./serialization.ts) is the portable
 * backup/exchange format that sits alongside this.
 */
export interface ProjectRepository {
	load(): Promise<Project | null>;
	save(project: Project): Promise<void>;
	clear(): Promise<void>;
}

interface ProjectRow {
	id: string;
	data: Project;
}

const ROW_ID = 'current';

class StoryAtlasDB extends Dexie {
	projects!: Table<ProjectRow, string>;

	constructor() {
		super('storyatlas');
		// Single-row table: the whole project is stored as one document, matching
		// the in-memory by-id-map model. Bump this version() + add an upgrade()
		// only if the IndexedDB shape itself changes (distinct from the project
		// schemaVersion, which is handled in serialization.ts on import).
		this.version(1).stores({ projects: 'id' });
	}
}

export class DexieProjectRepository implements ProjectRepository {
	private db = new StoryAtlasDB();

	async load(): Promise<Project | null> {
		const row = await this.db.projects.get(ROW_ID);
		return row?.data ?? null;
	}

	async save(project: Project): Promise<void> {
		// Defensively detach from any reactive proxy so IndexedDB gets a plain,
		// structured-cloneable object.
		const data = structuredClone(project) as Project;
		await this.db.projects.put({ id: ROW_ID, data });
	}

	async clear(): Promise<void> {
		await this.db.projects.delete(ROW_ID);
	}
}
