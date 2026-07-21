import {
	emptyProject,
	type Project,
	type SourceRef,
	type Character,
	type Location,
	type StoryEvent,
	type Scene,
	type StoryMeta
} from './model';
import {
	slug,
	asCharacterId,
	asLocationId,
	asEventId,
	asSceneId,
	type SourceId,
	type CharacterId,
	type LocationId,
	type EventId,
	type SceneId
} from './ids';
import {
	movementEdges,
	timelineScenes,
	timelineEvents,
	factionConflicts,
	keyEvents,
	concurrentStorylines,
	episodeGroups,
	characterDeaths,
	deathEvents,
	familyTree
} from './derive';

/**
 * The Single Source of Truth store.
 *
 * Holds the one mutable canonical `Project` (Svelte 5 deep-reactive `$state`)
 * and exposes derived views as `$derived` getters that recompute automatically
 * whenever the project changes. The UI binds straight to this; the persistence
 * layer mirrors `project` to IndexedDB. CRUD methods keep references consistent
 * (e.g. deleting a location nulls out events/scenes that pointed at it) so the
 * derived structures never see dangling ids.
 */
export class StoryStore {
	project = $state<Project>(emptyProject());

	// Derived, on-the-fly — never persisted.
	readonly movementEdges = $derived(movementEdges(this.project));
	readonly timelineScenes = $derived(timelineScenes(this.project));
	readonly timelineEvents = $derived(timelineEvents(this.project));
	readonly factionConflicts = $derived(factionConflicts(this.project));
	readonly keyEvents = $derived(keyEvents(this.project));
	readonly concurrentStorylines = $derived(concurrentStorylines(this.project));
	readonly episodeGroups = $derived(episodeGroups(this.project));
	readonly characterDeaths = $derived(characterDeaths(this.project));
	readonly deathEvents = $derived(deathEvents(this.project));
	readonly familyTree = $derived(familyTree(this.project));

	/** Replace the entire project (load from disk, import, or extraction merge). */
	load(project: Project): void {
		this.project = project;
	}

	reset(): void {
		this.project = emptyProject();
	}

	setMeta(patch: Partial<StoryMeta>): void {
		this.project.meta = { ...this.project.meta, ...patch };
	}

	/** Produce an id that is unique within the given record, derived from a seed. */
	uniqueId(seed: string, existing: Record<string, unknown>): string {
		const base = slug(seed) || 'item';
		if (!(base in existing)) return base;
		let n = 2;
		while (`${base}-${n}` in existing) n++;
		return `${base}-${n}`;
	}

	// ── Upserts (create or update by id) ──────────────────────────────────────
	upsertSource(source: SourceRef): void {
		this.project.sources[source.id] = source;
	}
	upsertCharacter(character: Character): void {
		this.project.characters[character.id] = character;
	}
	upsertLocation(location: Location): void {
		this.project.locations[location.id] = location;
	}
	upsertEvent(event: StoryEvent): void {
		this.project.events[event.id] = event;
	}
	upsertScene(scene: Scene): void {
		this.project.scenes[scene.id] = scene;
	}

	// ── Convenience creators (manual entities) ────────────────────────────────
	createCharacter(name = 'New character'): CharacterId {
		const id = asCharacterId(this.uniqueId(name, this.project.characters));
		this.project.characters[id] = { id, name, faction: null, aliases: [], origin: 'manual' };
		return id;
	}
	createLocation(name = 'New location'): LocationId {
		const id = asLocationId(this.uniqueId(name, this.project.locations));
		this.project.locations[id] = {
			id,
			name,
			type: 'other',
			coordinates: { x: null, y: null },
			origin: 'manual'
		};
		return id;
	}
	createEvent(title = 'New event'): EventId {
		const id = asEventId(this.uniqueId(title, this.project.events));
		const orderIndex = Object.keys(this.project.events).length;
		this.project.events[id] = {
			id,
			title,
			locationId: null,
			charactersInvolved: [],
			summary: '',
			orderIndex,
			origin: 'manual'
		};
		return id;
	}
	createScene(startHint = 'New scene'): SceneId {
		const id = asSceneId(this.uniqueId(startHint, this.project.scenes));
		const orderIndex = Object.keys(this.project.scenes).length;
		this.project.scenes[id] = {
			id,
			orderIndex,
			startHint,
			endHint: '',
			locationId: null,
			characters: [],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};
		return id;
	}

	// ── Deletes (with reference cleanup) ──────────────────────────────────────
	removeSource(id: SourceId): void {
		delete this.project.sources[id];
	}

	removeCharacter(id: CharacterId): void {
		delete this.project.characters[id];
		for (const event of Object.values(this.project.events)) {
			event.charactersInvolved = event.charactersInvolved.filter((c) => c !== id);
		}
		for (const scene of Object.values(this.project.scenes)) {
			scene.characters = scene.characters.filter((c) => c !== id);
		}
		// Keep family links dangling-free so the tree never references a ghost.
		for (const character of Object.values(this.project.characters)) {
			if (character.parentIds) character.parentIds = character.parentIds.filter((c) => c !== id);
			if (character.spouseIds) character.spouseIds = character.spouseIds.filter((c) => c !== id);
			if (character.riderIds) character.riderIds = character.riderIds.filter((c) => c !== id);
		}
	}

	removeLocation(id: LocationId): void {
		delete this.project.locations[id];
		for (const event of Object.values(this.project.events)) {
			if (event.locationId === id) event.locationId = null;
		}
		for (const scene of Object.values(this.project.scenes)) {
			if (scene.locationId === id) scene.locationId = null;
		}
	}

	removeEvent(id: EventId): void {
		delete this.project.events[id];
		for (const scene of Object.values(this.project.scenes)) {
			scene.eventIds = scene.eventIds.filter((e) => e !== id);
		}
	}

	removeScene(id: SceneId): void {
		delete this.project.scenes[id];
	}
}

/** App-wide singleton. Tests can instantiate StoryStore directly instead. */
export const store = new StoryStore();
