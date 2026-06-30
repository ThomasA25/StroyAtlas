import type { SourceId, CharacterId, LocationId, EventId, SceneId } from './ids';
import type { SourceType, LocationType } from './contract';

/**
 * The canonical internal data model — the Single Source of Truth.
 *
 * This is a camelCase, branded-ID projection of the extraction contract
 * (./contract.ts). EVERYTHING displayed is either stored here or derived from
 * here (see ./derive.ts) — derived structures (movements, conflicts, timeline,
 * concurrent storylines) are never persisted.
 *
 * Entities are kept in by-id maps (Record) so the editor can create/update/
 * delete any single entity in O(1) without scanning arrays. Every entity is
 * fully editable; `origin` only records whether it first arrived via extraction
 * or was authored by hand — it never makes anything read-only.
 */

export type Origin = 'extracted' | 'manual';

/**
 * What a character *is*. Dragons ride along with their rider (they share the
 * rider's scenes, so their movement/position/death are inherited) but are
 * flagged here so the map and other views can isolate them. Absent/undefined
 * reads as a person, so data predating this field stays valid.
 */
export type CharacterKind = 'person' | 'dragon';

export interface Coordinates {
	/** Fictional map coordinates. Null until placed (e.g. via the map editor). */
	x: number | null;
	y: number | null;
}

export interface SourceRef {
	id: SourceId;
	title: string;
	url: string;
	type: SourceType;
}

export interface Character {
	id: CharacterId;
	name: string;
	faction: string | null;
	aliases: string[];
	/** Person vs dragon; defaults to a person when omitted. See CharacterKind. */
	kind?: CharacterKind;
	origin: Origin;
}

export interface Location {
	id: LocationId;
	name: string;
	type: LocationType;
	coordinates: Coordinates;
	origin: Origin;
}

export interface StoryEvent {
	id: EventId;
	title: string;
	locationId: LocationId | null;
	charactersInvolved: CharacterId[];
	summary: string;
	orderIndex: number;
	/** Source season/episode this entity came from; null/undefined for manual entries. */
	season?: number | null;
	episode?: number | null;
	/** Characters who die in this event (canonical ids). Drives death-aware views. */
	deaths?: CharacterId[];
	origin: Origin;
}

export interface Scene {
	id: SceneId;
	orderIndex: number;
	startHint: string;
	endHint: string;
	locationId: LocationId | null;
	characters: CharacterId[];
	eventIds: EventId[];
	transitionToNext: string;
	/** Source season/episode this entity came from; null/undefined for manual entries. */
	season?: number | null;
	episode?: number | null;
	origin: Origin;
}

export interface StoryMeta {
	series: string;
	season: number | null;
	episode: number | null;
	title: string;
}

/**
 * Fictional base-map configuration. The image defines a pixel canvas; location
 * coordinates (x,y) live in that same pixel space (no real geo-coordinates).
 * `imageUrl` may be a remote URL or an inlined data: URL (uploaded image).
 */
export interface MapConfig {
	imageUrl: string;
	width: number;
	height: number;
}

/** Bump when the persisted/exported shape changes; drives migrations on import. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * The whole project state. This is what the store holds, what Dexie persists,
 * and what JSON export/import round-trips (wrapped with `schemaVersion`).
 */
export interface Project {
	schemaVersion: number;
	meta: StoryMeta;
	map: MapConfig | null;
	sources: Record<SourceId, SourceRef>;
	characters: Record<CharacterId, Character>;
	locations: Record<LocationId, Location>;
	events: Record<EventId, StoryEvent>;
	scenes: Record<SceneId, Scene>;
}

export function emptyProject(): Project {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		meta: { series: '', season: null, episode: null, title: '' },
		map: null,
		sources: {},
		characters: {},
		locations: {},
		events: {},
		scenes: {}
	};
}

/**
 * True when a project holds no user content. Used to decide whether to seed the
 * default dataset: a previously-persisted but empty project should not shadow it.
 */
export function isProjectEmpty(p: Project): boolean {
	return (
		Object.keys(p.sources).length === 0 &&
		Object.keys(p.characters).length === 0 &&
		Object.keys(p.locations).length === 0 &&
		Object.keys(p.events).length === 0 &&
		Object.keys(p.scenes).length === 0
	);
}
