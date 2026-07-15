import { describe, it, expect } from 'vitest';
import { emptyProject, type Character, type Project } from './model';
import { asCharacterId } from './ids';
import { familyTree, type FamilyTreeNode } from './derive';

const father = asCharacterId('father');
const mother = asCharacterId('mother');
const stepmother = asCharacterId('stepmother');
const childA = asCharacterId('child-a');
const childB = asCharacterId('child-b');
const halfChild = asCharacterId('half-child');
const loner = asCharacterId('loner');

function char(id: string, patch: Partial<Character> = {}): Character {
	return { id: asCharacterId(id), name: id, faction: null, aliases: [], origin: 'manual', ...patch };
}

function fixture(): Project {
	const p = emptyProject();
	// father married to mother (full siblings A+B) and to stepmother (half-sibling).
	p.characters[father] = char('father', { gender: 'male', spouseIds: [mother, stepmother] });
	p.characters[mother] = char('mother', { gender: 'female' });
	p.characters[stepmother] = char('stepmother', { gender: 'female' });
	p.characters[childA] = char('child-a', { gender: 'female', parentIds: [father, mother] });
	p.characters[childB] = char('child-b', { gender: 'male', parentIds: [father, mother] });
	p.characters[halfChild] = char('half-child', { gender: 'male', parentIds: [father, stepmother] });
	// No relations at all — must not appear in the tree.
	p.characters[loner] = char('loner');
	return p;
}

const byId = (nodes: FamilyTreeNode[]) => new Map(nodes.map((n) => [n.id as string, n]));

describe('familyTree', () => {
	it('excludes characters with no family relations', () => {
		const ids = familyTree(fixture()).map((n) => n.id as string);
		expect(ids).not.toContain('loner');
		expect(ids).toContain('father');
	});

	it('derives children from parent links', () => {
		const nodes = byId(familyTree(fixture()));
		const dad = nodes.get('father')!;
		expect(dad.children.map((c) => c.id as string).sort()).toEqual(['child-a', 'child-b', 'half-child']);
		expect(dad.children.every((c) => c.type === 'blood')).toBe(true);
	});

	it('makes spouse links reciprocal', () => {
		const nodes = byId(familyTree(fixture()));
		expect(nodes.get('mother')!.spouses.map((s) => s.id as string)).toEqual(['father']);
		expect(nodes.get('father')!.spouses.map((s) => s.id as string).sort()).toEqual([
			'mother',
			'stepmother'
		]);
	});

	it('marks full vs half siblings by shared parent set', () => {
		const nodes = byId(familyTree(fixture()));
		const a = nodes.get('child-a')!;
		const full = a.siblings.find((s) => (s.id as string) === 'child-b');
		const half = a.siblings.find((s) => (s.id as string) === 'half-child');
		expect(full?.type).toBe('blood');
		expect(half?.type).toBe('half');
	});

	it('ignores parent/spouse ids that point at missing characters', () => {
		const p = emptyProject();
		p.characters[childA] = char('child-a', { parentIds: [asCharacterId('ghost')] });
		expect(familyTree(p)).toEqual([]);
	});

	it('defaults a missing gender to male', () => {
		const p = emptyProject();
		p.characters[father] = char('father', { spouseIds: [mother] });
		p.characters[mother] = char('mother', { gender: 'female' });
		expect(byId(familyTree(p)).get('father')!.gender).toBe('male');
	});
});
