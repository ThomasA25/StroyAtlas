import { describe, it, expect } from 'vitest';
import { emptyProject, type Project } from '$lib/core/model';
import { asCharacterId, asEventId, asLocationId, asSceneId } from '$lib/core/ids';
import { characterDeaths } from '$lib/core/derive';
import { characterWaypoints } from '$lib/core/playback';
import { buildDeathBadges, buildDeathTrails } from './death-view';

const ned = asCharacterId('ned');
const killer = asCharacterId('killer');
const wf = asLocationId('winterfell');
const kl = asLocationId('kings-landing');

function project(): Project {
	const p = emptyProject();
	p.characters[ned] = { id: ned, name: 'Ned', faction: null, aliases: [], origin: 'manual' };
	p.characters[killer] = { id: killer, name: 'Ilyn Payne', faction: null, aliases: [], origin: 'manual' };
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
		orderIndex: 1,
		startHint: '',
		endHint: '',
		locationId: kl,
		characters: [ned],
		eventIds: [],
		transitionToNext: '',
		origin: 'manual'
	};
	const e0 = asEventId('e0');
	p.events[e0] = {
		id: e0,
		title: 'Execution',
		locationId: kl,
		charactersInvolved: [ned, killer],
		summary: '',
		orderIndex: 1,
		deaths: [ned],
		deathDetails: { [ned]: { killerId: killer } },
		origin: 'manual'
	};
	return p;
}

describe('buildDeathTrails', () => {
	it('has no trail before the death is reached', () => {
		const p = project();
		const trails = buildDeathTrails(
			p,
			0,
			characterDeaths(p),
			characterWaypoints(p),
			() => true,
			() => true
		);
		expect(trails).toEqual([]);
	});

	it('draws the route up to the death location once reached', () => {
		const p = project();
		const trails = buildDeathTrails(
			p,
			1,
			characterDeaths(p),
			characterWaypoints(p),
			() => true,
			() => true
		);
		expect(trails).toEqual([{ characterId: ned, points: [{ x: 0, y: 0 }, { x: 100, y: 50 }] }]);
	});
});

describe('buildDeathBadges', () => {
	it('tallies deaths per location with a killer-labeled tooltip line', () => {
		const p = project();
		const badges = buildDeathBadges(
			p,
			1,
			characterDeaths(p),
			() => true,
			() => true,
			'killed by'
		);
		expect(badges).toHaveLength(1);
		expect(badges[0]?.locationId).toBe(kl);
		expect(badges[0]?.count).toBe(1);
		expect(badges[0]?.tooltip.groups[0]?.lines[0]?.text).toBe('Ned — killed by Ilyn Payne');
	});

	it('is empty before the death orderIndex is reached', () => {
		const p = project();
		const badges = buildDeathBadges(p, 0, characterDeaths(p), () => true, () => true, 'killed by');
		expect(badges).toEqual([]);
	});
});
