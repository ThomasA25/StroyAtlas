import { describe, it, expect } from 'vitest';
import { emptyProject, type Character, type Project } from '$lib/core/model';
import { asCharacterId, asLocationId, asSceneId } from '$lib/core/ids';
import { characterDeaths } from '$lib/core/derive';
import { buildCharacterClusters, type ClusterFilters } from './character-clusters';

const ned = asCharacterId('ned');
const cat = asCharacterId('cat');
const drogon = asCharacterId('drogon');
const wf = asLocationId('winterfell');

function project(): Project {
	const p = emptyProject();
	p.characters[ned] = { id: ned, name: 'Ned', faction: 'Stark', aliases: [], origin: 'manual' };
	p.characters[cat] = { id: cat, name: 'Cat', faction: 'Stark', aliases: [], origin: 'manual' };
	p.characters[drogon] = {
		id: drogon,
		name: 'Drogon',
		faction: 'Stark',
		aliases: [],
		kind: 'dragon',
		sizeScale: 1.5,
		origin: 'manual'
	};
	p.locations[wf] = {
		id: wf,
		name: 'Winterfell',
		type: 'castle',
		coordinates: { x: 10, y: 20 },
		origin: 'manual'
	};
	const s0 = asSceneId('s0');
	p.scenes[s0] = {
		id: s0,
		orderIndex: 0,
		startHint: '',
		endHint: '',
		locationId: wf,
		characters: [ned, cat],
		eventIds: [],
		transitionToNext: '',
		origin: 'manual'
	};
	return p;
}

const defaultFilters: ClusterFilters = {
	isVisible: () => true,
	kindAllowed: () => true,
	hiddenFactions: new Set(),
	hiddenHouses: new Set(),
	houseFor: (c: Character) => c.house ?? '',
	showStationary: true,
	showDead: true
};

const labels = { travelers: 'Travelers', stationary: 'Stationary', dead: 'Dead' };

describe('buildCharacterClusters', () => {
	it('merges people at the same rounded position into one cluster', () => {
		const p = project();
		const clusters = buildCharacterClusters(p, p, 0, new Map(), defaultFilters, labels);
		expect(clusters).toHaveLength(1);
		expect(clusters[0]?.count).toBe(2);
		expect(clusters[0]?.category).toBe('stationary');
		expect(clusters[0]?.allDragons).toBe(false);
		expect(clusters[0]?.hasDragon).toBe(false);
	});

	it('flags a cluster of only dragons as allDragons, a mixed one as hasDragon only', () => {
		const p = project();
		p.scenes['s1' as never] = {
			id: 's1' as never,
			orderIndex: 0,
			startHint: '',
			endHint: '',
			locationId: wf,
			characters: [drogon],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};
		const mixed = buildCharacterClusters(p, p, 0, new Map(), defaultFilters, labels);
		expect(mixed[0]?.allDragons).toBe(false);
		expect(mixed[0]?.hasDragon).toBe(true);

		const onlyDragon = buildCharacterClusters(
			p,
			p,
			0,
			new Map(),
			{ ...defaultFilters, isVisible: (id) => id === drogon },
			labels
		);
		expect(onlyDragon[0]?.allDragons).toBe(true);
		expect(onlyDragon[0]?.hasDragon).toBe(true);
	});

	it('exposes the dragon lore size, defaulting to 1 when a cluster has none', () => {
		const p = project();
		expect(buildCharacterClusters(p, p, 0, new Map(), defaultFilters, labels)[0]?.dragonSizeScale).toBe(
			1
		);

		p.scenes['s1' as never] = {
			id: 's1' as never,
			orderIndex: 0,
			startHint: '',
			endHint: '',
			locationId: wf,
			characters: [drogon],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};
		const withDragon = buildCharacterClusters(p, p, 0, new Map(), defaultFilters, labels);
		expect(withDragon[0]?.dragonSizeScale).toBe(1.5);
	});

	it('rotates a flying dragon to face its travel direction, null when stationary', () => {
		const p = project();
		const kl = asLocationId('kings-landing');
		p.locations[kl] = {
			id: kl,
			name: "King's Landing",
			type: 'city',
			coordinates: { x: 110, y: 20 }, // due east of Winterfell (10,20)
			origin: 'manual'
		};
		p.scenes['s1' as never] = {
			id: 's1' as never,
			orderIndex: 0,
			startHint: '',
			endHint: '',
			locationId: wf,
			characters: [drogon],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};
		p.scenes['s2' as never] = {
			id: 's2' as never,
			orderIndex: 2,
			startHint: '',
			endHint: '',
			locationId: kl,
			characters: [drogon],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};
		const flying = buildCharacterClusters(
			p,
			p,
			1,
			new Map(),
			{ ...defaultFilters, isVisible: (id) => id === drogon },
			labels
		);
		expect(flying[0]?.dragonAngleDeg).toBeCloseTo(90); // facing due east
		const resting = buildCharacterClusters(
			p,
			p,
			0,
			new Map(),
			{ ...defaultFilters, isVisible: (id) => id === drogon },
			labels
		);
		expect(resting[0]?.dragonAngleDeg).toBeNull();
	});

	it('drops a hidden character', () => {
		const p = project();
		const clusters = buildCharacterClusters(
			p,
			p,
			0,
			new Map(),
			{ ...defaultFilters, isVisible: (id) => id !== cat },
			labels
		);
		expect(clusters[0]?.count).toBe(1);
	});

	it('drops characters of a hidden faction', () => {
		const p = project();
		const clusters = buildCharacterClusters(
			p,
			p,
			0,
			new Map(),
			{ ...defaultFilters, hiddenFactions: new Set(['Stark']) },
			labels
		);
		expect(clusters).toHaveLength(0);
	});

	it('marks a character dead once the clock reaches their death, dominant category "dead"', () => {
		const p = project();
		p.events['e0' as never] = {
			id: 'e0' as never,
			title: 'Death',
			locationId: wf,
			charactersInvolved: [ned],
			summary: '',
			orderIndex: 0,
			deaths: [ned],
			origin: 'manual'
		};
		const deaths = characterDeaths(p);
		const clusters = buildCharacterClusters(
			p,
			p,
			0,
			deaths,
			{ ...defaultFilters, isVisible: (id) => id === ned },
			labels
		);
		expect(clusters[0]?.category).toBe('dead');
		expect(clusters[0]?.tooltip.groups[0]?.lines[0]?.dead).toBe(true);
	});

	it('hides dead/stationary people when the corresponding toggle is off', () => {
		const p = project();
		const clusters = buildCharacterClusters(
			p,
			p,
			0,
			new Map(),
			{ ...defaultFilters, showStationary: false },
			labels
		);
		expect(clusters).toHaveLength(0);
	});
});
