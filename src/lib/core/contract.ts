import { z } from 'zod';

/**
 * The extraction data contract.
 *
 * This Zod schema IS the single contract for the LLM boundary. It is used for:
 *   1. the Anthropic `output_config.format` JSON schema (structured output), and
 *   2. validating the raw LLM result before anything touches the store.
 *
 * It mirrors the agreed JSON shape verbatim (snake_case, nullable where the
 * contract permits null). The internal canonical model (./model.ts) is a
 * camelCase, branded-ID projection of this — see ./from-extraction.ts for the
 * mapping. Keep this file in lockstep with the agreed contract.
 */

export const sourceTypeEnum = z.enum(['wiki', 'transcript', 'summary', 'other']);
export const locationTypeEnum = z.enum(['city', 'castle', 'region', 'sea', 'other']);

export type SourceType = z.infer<typeof sourceTypeEnum>;
export type LocationType = z.infer<typeof locationTypeEnum>;

export const sourceContract = z.object({
	title: z.string(),
	url: z.string(),
	type: sourceTypeEnum
});

export const characterContract = z.object({
	id: z.string(),
	name: z.string(),
	faction: z.string().nullable(),
	aliases: z.array(z.string())
});

export const coordinatesContract = z.object({
	x: z.number().nullable(),
	y: z.number().nullable()
});

export const locationContract = z.object({
	id: z.string(),
	name: z.string(),
	type: locationTypeEnum,
	coordinates: coordinatesContract
});

export const eventContract = z.object({
	id: z.string(),
	title: z.string(),
	location_id: z.string(),
	characters_involved: z.array(z.string()),
	summary: z.string(),
	order_index: z.number().int(),
	/** Contract-ids of characters who die in this event (optional; omit when none). */
	deaths: z.array(z.string()).optional()
});

export const sceneContract = z.object({
	id: z.string(),
	order_index: z.number().int(),
	start_hint: z.string(),
	end_hint: z.string(),
	location_id: z.string(),
	characters: z.array(z.string()),
	event_ids: z.array(z.string()),
	transition_to_next: z.string()
});

export const storyContract = z.object({
	series: z.string(),
	season: z.number().int().nullable(),
	episode: z.number().int().nullable(),
	title: z.string(),
	characters: z.array(characterContract),
	locations: z.array(locationContract),
	events: z.array(eventContract),
	scenes: z.array(sceneContract)
});

export const extractionContract = z.object({
	source: sourceContract,
	story: storyContract
});

export type ExtractionResult = z.infer<typeof extractionContract>;
export type ContractCharacter = z.infer<typeof characterContract>;
export type ContractLocation = z.infer<typeof locationContract>;
export type ContractEvent = z.infer<typeof eventContract>;
export type ContractScene = z.infer<typeof sceneContract>;
