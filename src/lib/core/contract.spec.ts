import { describe, it, expect } from 'vitest';
import { extractionContract } from './contract';

const validSample = {
	source: { title: 'Pilot recap', url: 'https://wiki.example/pilot', type: 'wiki' },
	story: {
		series: 'Iron Thrones',
		season: 1,
		episode: 1,
		title: 'Winter Approaches',
		characters: [{ id: 'ned-stark', name: 'Ned Stark', faction: 'House Stark', aliases: ['Lord Eddard'] }],
		locations: [
			{ id: 'kings-landing', name: "King's Landing", type: 'city', coordinates: { x: null, y: null } }
		],
		events: [
			{
				id: 'ned-summoned',
				title: 'Ned is summoned to the capital',
				location_id: 'kings-landing',
				characters_involved: ['ned-stark'],
				summary: 'The king asks Ned to serve as Hand.',
				order_index: 0
			}
		],
		scenes: [
			{
				id: 'scene-throne-room',
				order_index: 0,
				start_hint: 'Throne room, dawn',
				end_hint: 'Ned accepts',
				location_id: 'kings-landing',
				characters: ['ned-stark'],
				event_ids: ['ned-summoned'],
				transition_to_next: 'Cut to the road north'
			}
		]
	}
} as const;

describe('extractionContract', () => {
	it('accepts a well-formed extraction result', () => {
		const parsed = extractionContract.parse(validSample);
		expect(parsed.story.characters[0]?.name).toBe('Ned Stark');
	});

	it('allows nullable fields (faction, season, coordinates) to be null', () => {
		const withNulls = structuredClone(validSample) as typeof validSample;
		const result = extractionContract.safeParse({
			...withNulls,
			story: {
				...withNulls.story,
				season: null,
				episode: null,
				characters: [{ id: 'x', name: 'X', faction: null, aliases: [] }]
			}
		});
		expect(result.success).toBe(true);
	});

	it('rejects a result missing a required field', () => {
		const broken = structuredClone(validSample) as Record<string, unknown>;
		delete (broken.source as Record<string, unknown>).type;
		expect(extractionContract.safeParse(broken).success).toBe(false);
	});
});
