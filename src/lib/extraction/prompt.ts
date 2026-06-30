import type { Project } from '$lib/core/model';
import type { SourceType } from '$lib/core/contract';

export interface KnownEntities {
	characters: { id: string; name: string; aliases: string[] }[];
	locations: { id: string; name: string }[];
}

export interface SourceMeta {
	title: string;
	url: string;
	type: SourceType;
}

/** Existing entities, fed to the model so it reuses ids instead of inventing new ones. */
export function collectKnownEntities(project: Project): KnownEntities {
	return {
		characters: Object.values(project.characters).map((c) => ({
			id: c.id,
			name: c.name,
			aliases: c.aliases
		})),
		locations: Object.values(project.locations).map((l) => ({ id: l.id, name: l.name }))
	};
}

export const EXTRACTION_SYSTEM = [
	'You are a precise information-extraction engine for serialized fiction (e.g. GoT-style sagas with factions and places like "King\'s Landing").',
	'Extract structured story data from the source text and return it in the required schema. Rules:',
	'- Use ONLY information present in the input or strictly, logically derivable from it. Never invent characters, locations, events, factions, or details. Do not guess.',
	'- For missing scalar values use null; for missing lists use an empty array.',
	'- Standardize location names to a single canonical form and reuse it consistently.',
	'- Use stable, slug-like ids (lowercase, hyphen-separated) for characters and locations. When a known id is provided for a recurring entity, REUSE that exact id.',
	'- Events must be atomic (one discrete occurrence each) and ordered chronologically via order_index (0-based). Without timestamps, order_index defines order.',
	'- Scenes are ordered via order_index and reference the event ids and character ids you defined.',
	'- Any location_id / event id / character id referenced by an event or scene must exist in the corresponding list you return.'
].join('\n');

export function buildUserMessage(text: string, source: SourceMeta, known: KnownEntities): string {
	const hasKnown = known.characters.length > 0 || known.locations.length > 0;
	const knownBlock = hasKnown
		? 'Known entities — REUSE these exact ids when the same character/location appears; do not mint new ids for them:\n' +
			'Characters:\n' +
			(known.characters
				.map((c) => `- ${c.id}: ${c.name}${c.aliases.length ? ` (aka ${c.aliases.join(', ')})` : ''}`)
				.join('\n') || '- (none)') +
			'\nLocations:\n' +
			(known.locations.map((l) => `- ${l.id}: ${l.name}`).join('\n') || '- (none)') +
			'\n\n'
		: '';

	return (
		knownBlock +
		`Source metadata: title="${source.title}", url="${source.url}", type=${source.type}\n\n` +
		'Extract the structured story data from the source text below. Follow the schema exactly.\n\n' +
		`--- SOURCE TEXT START ---\n${text}\n--- SOURCE TEXT END ---`
	);
}
