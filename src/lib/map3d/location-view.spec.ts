import { describe, it, expect } from 'vitest';
import { emptyProject, type Project } from '$lib/core/model';
import { asCharacterId, asLocationId, asSceneId } from '$lib/core/ids';
import { buildLocationMarkers, buildMovementLines } from './location-view';

const ned = asCharacterId('ned');
const wf = asLocationId('winterfell');
const kl = asLocationId('kings-landing');
const unplaced = asLocationId('unplaced');

function project(): Project {
	const p = emptyProject();
	p.characters[ned] = { id: ned, name: 'Ned', faction: null, aliases: [], origin: 'manual' };
	p.locations[wf] = {
		id: wf,
		name: 'Winterfell',
		type: 'castle',
		coordinates: { x: 0, y: 0 },
		origin: 'manual'
	};
	p.locations[kl] = {
		id: kl,
		name: "King's Landing",
		type: 'city',
		coordinates: { x: 100, y: 50 },
		origin: 'manual'
	};
	p.locations[unplaced] = {
		id: unplaced,
		name: 'Unplaced',
		type: 'other',
		coordinates: { x: null, y: null },
		origin: 'manual'
	};
	const s0 = asSceneId('s0');
	const s1 = asSceneId('s1');
	p.scenes[s0] = {
		id: s0,
		orderIndex: 0,
		startHint: '',
		endHint: '',
		locationId: wf,
		characters: [ned],
		eventIds: [],
		transitionToNext: '',
		origin: 'manual'
	};
	p.scenes[s1] = {
		id: s1,
		orderIndex: 1,
		startHint: '',
		endHint: '',
		locationId: kl,
		characters: [ned],
		eventIds: [],
		transitionToNext: '',
		origin: 'manual'
	};
	return p;
}

describe('buildLocationMarkers', () => {
	it('skips unplaced locations', () => {
		const markers = buildLocationMarkers(project(), null);
		expect(markers.map((m) => m.id).sort()).toEqual([kl, wf].sort());
	});

	it('scopes to the given episode location set when provided', () => {
		const markers = buildLocationMarkers(project(), new Set([wf]));
		expect(markers.map((m) => m.id)).toEqual([wf]);
	});
});

describe('buildMovementLines', () => {
	it('builds a line per movement edge with resolved coordinates', () => {
		const p = project();
		const lines = buildMovementLines(
			p,
			p,
			() => true,
			() => true
		);
		expect(lines).toEqual([
			{ characterId: ned, from: { x: 0, y: 0 }, to: { x: 100, y: 50 } }
		]);
	});

	it('drops edges for hidden or disallowed characters', () => {
		const p = project();
		expect(
			buildMovementLines(
				p,
				p,
				() => false,
				() => true
			)
		).toEqual([]);
		expect(
			buildMovementLines(
				p,
				p,
				() => true,
				() => false
			)
		).toEqual([]);
	});
});
