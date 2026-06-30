import { describe, it, expect } from 'vitest';
import { emptyProject } from '$lib/core/model';
import type { ExtractionResult } from '$lib/core/contract';
import { mergeExtractionInto, nextOrderOffset } from './from-extraction';

function pilot(): ExtractionResult {
	return {
		source: { title: 'Pilot', url: 'http://x', type: 'wiki' },
		story: {
			series: 'Iron Thrones',
			season: 1,
			episode: 1,
			title: 'Ep1',
			characters: [
				{ id: 'ned', name: 'Ned Stark', faction: 'House Stark', aliases: ['Lord Eddard'] }
			],
			locations: [
				{ id: 'kl', name: "King's Landing", type: 'city', coordinates: { x: null, y: null } }
			],
			events: [
				{
					id: 'e1',
					title: 'Ned summoned',
					location_id: 'kl',
					characters_involved: ['ned'],
					summary: 'The king asks Ned to serve.',
					order_index: 0
				}
			],
			scenes: [
				{
					id: 's1',
					order_index: 0,
					start_hint: 'Throne room',
					end_hint: '',
					location_id: 'kl',
					characters: ['ned'],
					event_ids: ['e1'],
					transition_to_next: ''
				}
			]
		}
	};
}

describe('mergeExtractionInto', () => {
	it('creates canonical entities and rewires references to canonical ids', () => {
		const p = emptyProject();
		mergeExtractionInto(p, pilot());

		expect(Object.keys(p.characters)).toEqual(['ned-stark']);
		expect(Object.keys(p.locations)).toEqual(['kings-landing']);

		const event = p.events['ned-summoned' as keyof typeof p.events];
		expect(event?.locationId).toBe('kings-landing');
		expect(event?.charactersInvolved).toEqual(['ned-stark']);
		expect(event?.origin).toBe('extracted');

		const scene = p.scenes['throne-room' as keyof typeof p.scenes];
		expect(scene?.characters).toEqual(['ned-stark']);
		expect(scene?.eventIds).toEqual(['ned-summoned']);

		// Source season/episode is stamped onto events and scenes for per-episode views.
		expect(event).toMatchObject({ season: 1, episode: 1 });
		expect(scene).toMatchObject({ season: 1, episode: 1 });
	});

	it('resolves a recurring character by name and unions aliases instead of duplicating', () => {
		const p = emptyProject();
		mergeExtractionInto(p, pilot());

		const second: ExtractionResult = {
			source: { title: 'Recap', url: 'http://y', type: 'summary' },
			story: {
				series: 'Iron Thrones',
				season: 1,
				episode: 2,
				title: 'Ep2',
				characters: [{ id: 'n', name: 'Ned Stark', faction: null, aliases: ['The Wolf'] }],
				locations: [],
				events: [],
				scenes: [
					{
						id: 's',
						order_index: 0,
						start_hint: 'Road north',
						end_hint: '',
						location_id: '',
						characters: ['n'],
						event_ids: [],
						transition_to_next: ''
					}
				]
			}
		};

		mergeExtractionInto(p, second, { orderOffset: nextOrderOffset(p) });

		expect(Object.keys(p.characters)).toEqual(['ned-stark']);
		expect(p.characters['ned-stark' as keyof typeof p.characters]?.aliases).toEqual(
			expect.arrayContaining(['Lord Eddard', 'The Wolf'])
		);
		// order offset pushes the second source's scene after the first (max 0 -> offset 1)
		expect(p.scenes['road-north' as keyof typeof p.scenes]?.orderIndex).toBe(1);
	});
});
