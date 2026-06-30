/**
 * Branded ID types.
 *
 * IDs are plain strings at runtime but carry a compile-time brand so a
 * CharacterId can never be passed where a LocationId is expected. This is the
 * "Branded ID-Types" architecture constraint — it catches a whole class of
 * wiring bugs (e.g. putting a scene id into an event's location_id) for free.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type SourceId = Brand<string, 'Source'>;
export type CharacterId = Brand<string, 'Character'>;
export type LocationId = Brand<string, 'Location'>;
export type EventId = Brand<string, 'Event'>;
export type SceneId = Brand<string, 'Scene'>;

export type AnyId = SourceId | CharacterId | LocationId | EventId | SceneId;

// Explicit cast helpers — the only sanctioned way to brand a raw string.
export const asSourceId = (s: string): SourceId => s as SourceId;
export const asCharacterId = (s: string): CharacterId => s as CharacterId;
export const asLocationId = (s: string): LocationId => s as LocationId;
export const asEventId = (s: string): EventId => s as EventId;
export const asSceneId = (s: string): SceneId => s as SceneId;

/**
 * Deterministic, URL-safe slug from arbitrary text.
 *
 * Used by the (intentionally light) entity-resolution step to derive stable IDs
 * from a normalized name, so the same "King's Landing" maps to the same id
 * across sources without a heavyweight matching pass.
 */
export function slug(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip diacritics
		.replace(/['’`]/g, '') // drop apostrophes so "King's" -> "kings", not "king-s"
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
