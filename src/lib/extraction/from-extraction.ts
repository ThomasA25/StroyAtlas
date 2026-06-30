import type { Project } from '$lib/core/model';
import type { ExtractionResult } from '$lib/core/contract';
import {
	slug,
	asSourceId,
	asCharacterId,
	asLocationId,
	asEventId,
	asSceneId,
	type CharacterId,
	type LocationId,
	type EventId
} from '$lib/core/ids';

/**
 * Maps a validated extraction result into the canonical model and merges it into
 * the project, in place. The result is a *draft* — every produced entity is
 * marked `origin: 'extracted'` and is fully editable afterwards.
 *
 * Entity resolution is deliberately light (the agreed MVP scope): characters and
 * locations are matched to existing entities by normalized name / alias / id so
 * the same "King's Landing" reuses one id across sources; events and scenes are
 * created fresh (cross-source dedup is future work). Contract-local ids are
 * remapped to canonical ids before wiring references, so no dangling ids leak in.
 */
export interface MergeOptions {
	/** Added to incoming order_index values — lets the orchestrator chain chunks. */
	orderOffset?: number;
}

export function mergeExtractionInto(
	project: Project,
	result: ExtractionResult,
	opts: MergeOptions = {}
): void {
	const offset = opts.orderOffset ?? 0;
	const { source, story } = result;

	// Source
	const sourceId = asSourceId(uniqueKey(slug(source.title) || 'source', project.sources));
	project.sources[sourceId] = {
		id: sourceId,
		title: source.title,
		url: source.url,
		type: source.type
	};

	// Meta — fill only if still empty, so manual edits are never clobbered.
	if (!project.meta.series && !project.meta.title) {
		project.meta = {
			series: story.series,
			season: story.season,
			episode: story.episode,
			title: story.title
		};
	}

	// Characters
	const charMap = new Map<string, CharacterId>();
	for (const c of story.characters) {
		let canonical = resolveExistingCharacter(project, c.id, c.name, c.aliases);
		if (canonical) {
			const existing = project.characters[canonical];
			if (existing) {
				existing.aliases = dedupe([
					...existing.aliases,
					...c.aliases,
					...(slug(c.name) === canonical ? [] : [c.name])
				]);
				if (!existing.faction && c.faction) existing.faction = c.faction;
			}
		} else {
			canonical = asCharacterId(uniqueKey(slug(c.name) || slug(c.id) || 'character', project.characters));
			project.characters[canonical] = {
				id: canonical,
				name: c.name,
				faction: c.faction,
				aliases: dedupe(c.aliases),
				origin: 'extracted'
			};
		}
		charMap.set(c.id, canonical);
	}

	// Locations
	const locMap = new Map<string, LocationId>();
	for (const l of story.locations) {
		let canonical = resolveExistingLocation(project, l.id, l.name);
		if (canonical) {
			const existing = project.locations[canonical];
			if (existing) {
				// Preserve manually placed coordinates; only fill gaps.
				if (existing.coordinates.x == null && l.coordinates.x != null)
					existing.coordinates.x = l.coordinates.x;
				if (existing.coordinates.y == null && l.coordinates.y != null)
					existing.coordinates.y = l.coordinates.y;
			}
		} else {
			canonical = asLocationId(uniqueKey(slug(l.name) || slug(l.id) || 'location', project.locations));
			project.locations[canonical] = {
				id: canonical,
				name: l.name,
				type: l.type,
				coordinates: { x: l.coordinates.x, y: l.coordinates.y },
				origin: 'extracted'
			};
		}
		locMap.set(l.id, canonical);
	}

	// Events (created fresh; references remapped to canonical ids)
	const eventMap = new Map<string, EventId>();
	for (const e of story.events) {
		const id = asEventId(uniqueKey(slug(e.title) || 'event', project.events));
		project.events[id] = {
			id,
			title: e.title,
			locationId: locMap.get(e.location_id) ?? null,
			charactersInvolved: dedupe(
				e.characters_involved.map((cid) => charMap.get(cid)).filter(isDefined)
			),
			summary: e.summary,
			orderIndex: e.order_index + offset,
			season: story.season,
			episode: story.episode,
			deaths: e.deaths
				? dedupe(e.deaths.map((cid) => charMap.get(cid)).filter(isDefined))
				: undefined,
			origin: 'extracted'
		};
		eventMap.set(e.id, id);
	}

	// Scenes
	for (const s of story.scenes) {
		const seed = s.start_hint || `scene-${s.order_index}`;
		const id = asSceneId(uniqueKey(slug(seed) || 'scene', project.scenes));
		project.scenes[id] = {
			id,
			orderIndex: s.order_index + offset,
			startHint: s.start_hint,
			endHint: s.end_hint,
			locationId: locMap.get(s.location_id) ?? null,
			characters: dedupe(s.characters.map((cid) => charMap.get(cid)).filter(isDefined)),
			eventIds: s.event_ids.map((eid) => eventMap.get(eid)).filter(isDefined),
			transitionToNext: s.transition_to_next,
			season: story.season,
			episode: story.episode,
			origin: 'extracted'
		};
	}
}

/** Next order offset so a follow-up chunk's scenes/events sort after existing ones. */
export function nextOrderOffset(project: Project): number {
	let max = -1;
	for (const s of Object.values(project.scenes)) max = Math.max(max, s.orderIndex);
	for (const e of Object.values(project.events)) max = Math.max(max, e.orderIndex);
	return max + 1;
}

function resolveExistingCharacter(
	project: Project,
	contractId: string,
	name: string,
	aliases: string[]
): CharacterId | null {
	const direct = asCharacterId(contractId);
	if (project.characters[direct]) return direct;
	const keys = new Set([slug(name), ...aliases.map(slug)].filter(Boolean));
	for (const ch of Object.values(project.characters)) {
		const chKeys = new Set([ch.id as string, slug(ch.name), ...ch.aliases.map(slug)]);
		for (const k of keys) if (chKeys.has(k)) return ch.id;
	}
	return null;
}

function resolveExistingLocation(
	project: Project,
	contractId: string,
	name: string
): LocationId | null {
	const direct = asLocationId(contractId);
	if (project.locations[direct]) return direct;
	const key = slug(name);
	if (!key) return null;
	for (const loc of Object.values(project.locations)) {
		if ((loc.id as string) === key || slug(loc.name) === key) return loc.id;
	}
	return null;
}

function uniqueKey(base: string, existing: Record<string, unknown>): string {
	const seed = base || 'item';
	if (!(seed in existing)) return seed;
	let n = 2;
	while (`${seed}-${n}` in existing) n++;
	return `${seed}-${n}`;
}

function dedupe<T>(items: T[]): T[] {
	return [...new Set(items)];
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
