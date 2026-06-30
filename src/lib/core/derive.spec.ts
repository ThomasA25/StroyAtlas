import { describe, it, expect } from 'vitest';
import { emptyProject, type Project } from './model';
import {
	asCharacterId,
	asLocationId,
	asEventId,
	asSceneId
} from './ids';
import {
	movementEdges,
	timelineScenes,
	factionConflicts,
	keyEvents,
	concurrentStorylines,
	episodeGroups,
	episodeKeyOf
} from './derive';

const ned = asCharacterId('ned');
const cersei = asCharacterId('cersei');
const winterfell = asLocationId('winterfell');
const kingsLanding = asLocationId('kings-landing');
const eBattle = asEventId('battle');
const eCouncil = asEventId('council');
const s0 = asSceneId('s0');
const s1 = asSceneId('s1');
const s2 = asSceneId('s2');

function fixture(): Project {
	const p = emptyProject();
	p.characters[ned] = { id: ned, name: 'Ned', faction: 'House Stark', aliases: [], origin: 'manual' };
	p.characters[cersei] = {
		id: cersei,
		name: 'Cersei',
		faction: 'House Lannister',
		aliases: [],
		origin: 'manual'
	};
	p.locations[winterfell] = {
		id: winterfell,
		name: 'Winterfell',
		type: 'castle',
		coordinates: { x: null, y: null },
		origin: 'manual'
	};
	p.locations[kingsLanding] = {
		id: kingsLanding,
		name: "King's Landing",
		type: 'city',
		coordinates: { x: null, y: null },
		origin: 'manual'
	};
	p.events[eBattle] = {
		id: eBattle,
		title: 'The battle at the gate',
		locationId: kingsLanding,
		charactersInvolved: [ned, cersei],
		summary: 'A clash between the houses.',
		orderIndex: 0,
		origin: 'manual'
	};
	p.events[eCouncil] = {
		id: eCouncil,
		title: 'Small council meeting',
		locationId: kingsLanding,
		charactersInvolved: [cersei],
		summary: 'The crown decides a new decree.',
		orderIndex: 1,
		origin: 'manual'
	};
	p.scenes[s0] = {
		id: s0,
		orderIndex: 0,
		startHint: '',
		endHint: '',
		locationId: winterfell,
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
		locationId: kingsLanding,
		characters: [ned],
		eventIds: [eBattle],
		transitionToNext: '',
		origin: 'manual'
	};
	p.scenes[s2] = {
		id: s2,
		orderIndex: 1,
		startHint: '',
		endHint: '',
		locationId: kingsLanding,
		characters: [cersei],
		eventIds: [eCouncil],
		transitionToNext: '',
		origin: 'manual'
	};
	return p;
}

describe('movementEdges', () => {
	it("tracks a character's location-to-location journey, skipping same-location steps", () => {
		const edges = movementEdges(fixture());
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			characterId: ned,
			fromLocationId: winterfell,
			toLocationId: kingsLanding,
			order: 0
		});
	});
});

describe('timelineScenes', () => {
	it('orders scenes by order_index, ties broken by id', () => {
		expect(timelineScenes(fixture()).map((s) => s.id)).toEqual([s0, s1, s2]);
	});
});

describe('factionConflicts', () => {
	it('links factions that share an event', () => {
		const conflicts = factionConflicts(fixture());
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			factionA: 'House Lannister',
			factionB: 'House Stark',
			weight: 1
		});
		expect(conflicts[0]?.eventIds).toContain(eBattle);
	});
});

describe('keyEvents', () => {
	it('flags battle and politics events via keyword match', () => {
		const flagged = keyEvents(fixture());
		const byId = new Map(flagged.map((k) => [k.event.id, k.categories]));
		expect(byId.get(eBattle)).toContain('battle');
		expect(byId.get(eCouncil)).toContain('politics');
	});
});

describe('concurrentStorylines', () => {
	it('groups scenes that share an order_index', () => {
		const groups = concurrentStorylines(fixture());
		expect(groups).toHaveLength(1);
		expect(groups[0]?.orderIndex).toBe(1);
		expect(groups[0]?.sceneIds.sort()).toEqual([s1, s2].sort());
	});
});

describe('episodeGroups', () => {
	function episodic(): Project {
		const p = emptyProject();
		p.scenes[asSceneId('a')] = {
			id: asSceneId('a'), orderIndex: 5, startHint: '', endHint: '', locationId: null,
			characters: [], eventIds: [], transitionToNext: '', season: 1, episode: 2, origin: 'extracted'
		};
		p.scenes[asSceneId('b')] = {
			id: asSceneId('b'), orderIndex: 1, startHint: '', endHint: '', locationId: null,
			characters: [], eventIds: [], transitionToNext: '', season: 1, episode: 1, origin: 'extracted'
		};
		p.scenes[asSceneId('c')] = {
			id: asSceneId('c'), orderIndex: 6, startHint: '', endHint: '', locationId: null,
			characters: [], eventIds: [], transitionToNext: '', season: 1, episode: 2, origin: 'extracted'
		};
		p.scenes[asSceneId('m')] = {
			id: asSceneId('m'), orderIndex: 9, startHint: '', endHint: '', locationId: null,
			characters: [], eventIds: [], transitionToNext: '', origin: 'manual'
		};
		return p;
	}

	it('groups scenes by season+episode, ordered by timeline position', () => {
		const groups = episodeGroups(episodic());
		expect(groups.map((g) => g.label)).toEqual(['S01E01', 'S01E02', 'Unassigned']);
		const e2 = groups.find((g) => g.key === 's1e2');
		expect(e2).toMatchObject({ sceneCount: 2, orderStart: 5, orderEnd: 6 });
	});

	it('keys manual (episode-less) scenes as "unassigned"', () => {
		expect(episodeKeyOf({ season: 1, episode: 3 })).toBe('s1e3');
		expect(episodeKeyOf({})).toBe('unassigned');
		expect(episodeKeyOf({ season: 1, episode: null })).toBe('unassigned');
	});
});
