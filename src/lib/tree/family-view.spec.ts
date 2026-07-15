import { describe, it, expect } from 'vitest';
import { emptyProject, type Character, type Project } from '$lib/core/model';
import { asCharacterId } from '$lib/core/ids';
import { familyTree } from '$lib/core/derive';
import {
	buildFamilyGroups,
	buildFamilyLayout,
	buildProfile,
	houseFor,
	houseOf,
	pickFamilyRoot
} from './family-view';
import type { TreeGeometry } from './types';

const gramps = asCharacterId('aegon-targaryen');
const granny = asCharacterId('visenya-targaryen');
const son = asCharacterId('aenys-targaryen');
const daughter = asCharacterId('rhaena-targaryen');
const inLaw = asCharacterId('corlys-velaryon');
const grandchild = asCharacterId('laena-velaryon');

function char(id: string, name: string, patch: Partial<Character> = {}): Character {
	return {
		id: asCharacterId(id),
		name,
		faction: null,
		aliases: [],
		origin: 'manual',
		...patch
	};
}

/**
 * Three generations: a founding couple, their two children, and a grandchild via
 * the daughter's marriage to a Velaryon.
 */
function project(): Project {
	const p = emptyProject();
	p.characters[gramps] = char('aegon-targaryen', 'Aegon Targaryen', {
		gender: 'male',
		spouseIds: [granny]
	});
	p.characters[granny] = char('visenya-targaryen', 'Visenya Targaryen', { gender: 'female' });
	p.characters[son] = char('aenys-targaryen', 'Aenys Targaryen', {
		gender: 'male',
		parentIds: [gramps, granny]
	});
	p.characters[daughter] = char('rhaena-targaryen', 'Rhaena Targaryen', {
		gender: 'female',
		parentIds: [gramps, granny],
		spouseIds: [inLaw]
	});
	p.characters[inLaw] = char('corlys-velaryon', 'Corlys Velaryon', { gender: 'male' });
	p.characters[grandchild] = char('laena-velaryon', 'Laena Velaryon', {
		gender: 'female',
		parentIds: [daughter, inLaw]
	});
	return p;
}

const nodesOf = (p: Project) => familyTree(p);

describe('houseOf / houseFor', () => {
	it('takes the last name token as the house', () => {
		expect(houseOf('Viserys I Targaryen')).toBe('Targaryen');
	});

	it('takes the trailing "of X" as the house', () => {
		expect(houseOf('Addam of Hull')).toBe('Hull');
	});

	it('leaves single-name characters without a house', () => {
		expect(houseOf('Mysaria')).toBe('');
	});

	it('prefers an explicit house over the parsed name', () => {
		expect(houseFor(char('x', 'Addam of Hull', { house: 'Velaryon' }))).toBe('Velaryon');
	});

	it('returns an empty house for an unknown character', () => {
		expect(houseFor(undefined)).toBe('');
	});
});

describe('buildFamilyGroups', () => {
	it('groups tree members by house, largest first', () => {
		const p = project();
		const groups = buildFamilyGroups(nodesOf(p), p);
		expect(groups.map((g) => [g.house, g.memberIds.length])).toEqual([
			['Targaryen', 4],
			['Velaryon', 2]
		]);
	});

	it('is empty when nobody has family relations', () => {
		expect(buildFamilyGroups([], emptyProject())).toEqual([]);
	});
});

describe('pickFamilyRoot', () => {
	it('picks the founder with the most descendants', () => {
		const p = project();
		const nodes = nodesOf(p);
		const targaryens = buildFamilyGroups(nodes, p)[0];
		// Both Aegon and Visenya are founders with 3 descendants; the first wins.
		expect(['aegon-targaryen', 'visenya-targaryen']).toContain(
			pickFamilyRoot(nodes, targaryens.memberIds)
		);
	});

	it('prefers a founder over a descendant with no children', () => {
		const p = project();
		const nodes = nodesOf(p);
		// Corlys (founder, 1 descendant) beats his child Laena (0 descendants).
		expect(pickFamilyRoot(nodes, [grandchild, inLaw])).toBe(inLaw);
	});

	it('returns null for an empty family', () => {
		expect(pickFamilyRoot(nodesOf(project()), [])).toBeNull();
	});
});

describe('buildFamilyLayout', () => {
	const geometry: TreeGeometry = { slotWidth: 100, slotHeight: 80 };

	it('returns null without a root', () => {
		const p = project();
		expect(buildFamilyLayout(nodesOf(p), null, p, geometry)).toBeNull();
	});

	it('returns null when the root is not part of the tree', () => {
		const p = project();
		expect(buildFamilyLayout(nodesOf(p), asCharacterId('ghost'), p, geometry)).toBeNull();
	});

	it('scales grid units to pixels using half a slot per unit', () => {
		const p = project();
		const layout = buildFamilyLayout(nodesOf(p), gramps, p, geometry)!;
		expect(layout).not.toBeNull();
		// Every card is one slot wide/tall and sits on a half-slot grid.
		for (const card of layout.cards) {
			expect(card.width).toBe(geometry.slotWidth);
			expect(card.height).toBe(geometry.slotHeight);
			expect(card.left % (geometry.slotWidth / 2)).toBe(0);
			expect(card.top % (geometry.slotHeight / 2)).toBe(0);
		}
		expect(layout.width).toBeGreaterThan(0);
		expect(layout.height).toBeGreaterThan(0);
	});

	it('resolves names and marks the root', () => {
		const p = project();
		const layout = buildFamilyLayout(nodesOf(p), gramps, p, geometry)!;
		const root = layout.cards.filter((c) => c.isRoot);
		expect(root.length).toBeGreaterThan(0);
		expect(root[0].name).toBe('Aegon Targaryen');
		expect(layout.cards.map((c) => c.name)).toContain('Laena Velaryon');
	});

	it('gives every card a unique key even when a character is drawn twice', () => {
		const p = project();
		const layout = buildFamilyLayout(nodesOf(p), gramps, p, geometry)!;
		const keys = layout.cards.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('produces connectors with unique keys', () => {
		const p = project();
		const layout = buildFamilyLayout(nodesOf(p), gramps, p, geometry)!;
		const keys = layout.connectors.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('buildProfile', () => {
	it('builds the display facts for a character', () => {
		const p = project();
		p.characters[gramps].faction = 'Blacks';
		p.characters[gramps].aliases = ['The Conqueror'];
		const profile = buildProfile(p.characters[gramps])!;
		expect(profile).toMatchObject({
			id: gramps,
			name: 'Aegon Targaryen',
			initial: 'A',
			house: 'Targaryen',
			faction: 'Blacks',
			aliases: ['The Conqueror']
		});
		expect(profile.accent).toMatch(/^#|^hsl/);
	});

	it('resolves the faction at the end of the timeline', () => {
		const p = project();
		p.characters[gramps].faction = 'Neutral';
		p.characters[gramps].allegiances = [{ orderIndex: 5, faction: 'Greens' }];
		expect(buildProfile(p.characters[gramps])!.faction).toBe('Greens');
	});

	it('returns null for an unknown character', () => {
		expect(buildProfile(undefined)).toBeNull();
	});
});
