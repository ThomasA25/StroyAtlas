import { describe, it, expect } from 'vitest';
import { emptyProject, type Character, type Project } from '$lib/core/model';
import { asCharacterId, asLocationId, asSceneId } from '$lib/core/ids';
import { characterDeaths } from '$lib/core/derive';
import { buildCharacterClusters, type ClusterFilters } from './character-clusters';

const ned = asCharacterId('ned');
const cat = asCharacterId('cat');
const wf = asLocationId('winterfell');

function project(): Project {
	const p = emptyProject();
	p.characters[ned] = { id: ned, name: 'Ned', faction: 'Stark', aliases: [], origin: 'manual' };
	p.characters[cat] = { id: cat, name: 'Cat', faction: 'Stark', aliases: [], origin: 'manual' };
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
