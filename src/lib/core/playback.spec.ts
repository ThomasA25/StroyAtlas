import { describe, it, expect } from 'vitest';
import { emptyProject, type Project } from './model';
import { asCharacterId, asLocationId, asSceneId } from './ids';
import { characterWaypoints, positionAt, characterPositionsAt, activeCharactersAt } from './playback';

const ned = asCharacterId('ned');
const wf = asLocationId('winterfell');
const kl = asLocationId('kings-landing');

function moving(): Project {
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
		orderIndex: 2,
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

describe('playback', () => {
	it('builds ordered waypoints per character from located scenes', () => {
		const wps = characterWaypoints(moving()).get(ned);
		expect(wps?.map((w) => w.orderIndex)).toEqual([0, 2]);
	});

	it('interpolates the midpoint between two waypoints', () => {
		const wps = characterWaypoints(moving()).get(ned)!;
		expect(positionAt(wps, 1)).toEqual({ x: 50, y: 25 });
	});

	it('clamps before first and after last waypoint', () => {
		const wps = characterWaypoints(moving()).get(ned)!;
		expect(positionAt(wps, -5)).toEqual({ x: 0, y: 0 });
		expect(positionAt(wps, 99)).toEqual({ x: 100, y: 50 });
	});

	it('reports character positions and active characters at a time', () => {
		const p = moving();
		expect(characterPositionsAt(p, 0)).toEqual([{ characterId: ned, x: 0, y: 0 }]);
		expect([...activeCharactersAt(p, 0)]).toEqual([ned]);
		expect([...activeCharactersAt(p, 2)]).toEqual([ned]);
		expect([...activeCharactersAt(p, 1)]).toEqual([]); // no scene at order 1
	});
});
