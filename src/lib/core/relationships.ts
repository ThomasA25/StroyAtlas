import type { Project } from './model';
import type { CharacterId } from './ids';

/**
 * Character relationship graph — undirected character-to-character links,
 * weighted by how often two characters co-occur in the same event or scene.
 * Pure and data-grounded (no invented relationships). Feeds the Cytoscape graph.
 */
export interface CharacterLink {
	a: CharacterId;
	b: CharacterId;
	weight: number;
}

export function characterRelationships(project: Project): CharacterLink[] {
	const byPair = new Map<string, CharacterLink>();

	const addPair = (x: CharacterId, y: CharacterId) => {
		const [a, b] = (x as string) < (y as string) ? [x, y] : [y, x];
		const key = `${a}|${b}`;
		const existing = byPair.get(key) ?? { a, b, weight: 0 };
		existing.weight++;
		byPair.set(key, existing);
	};

	const groups: CharacterId[][] = [
		...Object.values(project.events).map((e) => e.charactersInvolved),
		...Object.values(project.scenes).map((s) => s.characters)
	];

	for (const group of groups) {
		const unique = [...new Set(group)];
		for (let i = 0; i < unique.length; i++) {
			for (let j = i + 1; j < unique.length; j++) {
				const a = unique[i];
				const b = unique[j];
				if (a && b) addPair(a, b);
			}
		}
	}

	return [...byPair.values()].sort((x, y) => y.weight - x.weight);
}
