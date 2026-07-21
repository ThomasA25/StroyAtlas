import calcTree from 'relatives-tree';
import type { Node as RelNode } from 'relatives-tree/lib/types';
import type { Character, Project } from '$lib/core/model';
import type { CharacterId } from '$lib/core/ids';
import { factionAt, type FamilyTreeNode } from '$lib/core/derive';
import { factionColor } from '$lib/ui/faction-color';
import {
	DEFAULT_GEOMETRY,
	type FamilyGroupVM,
	type FamilyLayoutVM,
	type ProfileVM,
	type TreeCardVM,
	type TreeConnectorVM,
	type TreeGeometry
} from './types';

/**
 * Pure builders for the family tree page. They turn the derived family graph
 * (derive.familyTree) plus the project into plain render data — the Svelte
 * components under $lib/tree only draw what these return, and hold no logic of
 * their own. Mirrors the map3d builder pattern.
 */

/**
 * A family tree has no timeline position, so allegiance is resolved at the end
 * of the story — the side a character ultimately stood on.
 */
const FINAL_POSITION = Number.MAX_SAFE_INTEGER;

/**
 * House parsed from a name: the trailing "of X", else the last name token.
 * Single-name characters (e.g. "Mysaria") have no house. Mirrors the fallback
 * the map view uses, so a character's house reads the same in both places.
 */
export function houseOf(name: string): string {
	const of = name.match(/\bof\s+(.+)$/i);
	if (of) return of[1].trim();
	const parts = name.trim().split(/\s+/);
	return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** A character's house: the explicit field when set, else parsed from the name. */
export function houseFor(character: Character | undefined): string {
	if (!character) return '';
	return character.house ?? houseOf(character.name);
}

/** Accent colour for a character — their final allegiance. */
export function accentFor(character: Character | undefined): string {
	return factionColor(character ? factionAt(character, FINAL_POSITION) : null);
}

/** Houses present in the tree, largest first — the family picker's options. */
export function buildFamilyGroups(
	nodes: readonly FamilyTreeNode[],
	project: Project
): FamilyGroupVM[] {
	const byHouse = new Map<string, CharacterId[]>();
	for (const node of nodes) {
		const house = houseFor(project.characters[node.id]);
		if (!house) continue;
		const members = byHouse.get(house);
		if (members) members.push(node.id);
		else byHouse.set(house, [node.id]);
	}
	return [...byHouse.entries()]
		.map(([house, memberIds]) => ({ house, memberIds }))
		.sort((a, b) => b.memberIds.length - a.memberIds.length || a.house.localeCompare(b.house));
}

/**
 * The best root for a family: prefer a founder (nobody in the tree is their
 * parent), then whoever has the most descendants — so the whole dynasty hangs
 * beneath its eldest ancestor rather than off a leaf. Null for an empty family.
 */
export function pickFamilyRoot(
	nodes: readonly FamilyTreeNode[],
	memberIds: readonly CharacterId[]
): CharacterId | null {
	if (memberIds.length === 0) return null;
	const childrenOf = new Map<CharacterId, CharacterId[]>(
		nodes.map((n) => [n.id, n.children.map((c) => c.id)])
	);
	const hasParent = new Map<CharacterId, boolean>(nodes.map((n) => [n.id, n.parents.length > 0]));

	const descendantCount = (id: CharacterId): number => {
		const seen = new Set<CharacterId>();
		const stack = [id];
		while (stack.length) {
			const current = stack.pop()!;
			for (const child of childrenOf.get(current) ?? []) {
				if (seen.has(child)) continue;
				seen.add(child);
				stack.push(child);
			}
		}
		return seen.size;
	};

	// A founder always outranks a descendant, hence the large constant bonus.
	const FOUNDER_BONUS = 1_000_000;
	let best = memberIds[0];
	let bestScore = -1;
	for (const id of memberIds) {
		const score = (hasParent.get(id) ? 0 : FOUNDER_BONUS) + descendantCount(id);
		if (score > bestScore) {
			bestScore = score;
			best = id;
		}
	}
	return best;
}

/**
 * Positioned cards + connectors for a root, in pixels. Returns null when there
 * is nothing to lay out (no root, root outside the tree) or when relatives-tree
 * rejects the graph — the page then shows its empty state instead of blanking.
 */
export function buildFamilyLayout(
	nodes: readonly FamilyTreeNode[],
	rootId: CharacterId | null,
	project: Project,
	geometry: TreeGeometry = DEFAULT_GEOMETRY
): FamilyLayoutVM | null {
	if (!rootId || nodes.length === 0) return null;
	if (!nodes.some((n) => n.id === rootId)) return null;

	// One relatives-tree grid unit = half a card slot (a node spans 2 units).
	const unitX = geometry.slotWidth / 2;
	const unitY = geometry.slotHeight / 2;

	let data;
	try {
		// derive.familyTree is library-free (plain string relation types); this is
		// the single boundary where it is handed to relatives-tree.
		data = calcTree(nodes as unknown as RelNode[], { rootId, placeholders: false });
	} catch (err) {
		console.error('family tree layout failed', err);
		return null;
	}

	const cards: TreeCardVM[] = data.nodes.map((node) => {
		const character = project.characters[node.id as CharacterId];
		return {
			key: `${node.id}@${node.left},${node.top}`,
			id: node.id as CharacterId,
			name: character?.name ?? node.id,
			accent: accentFor(character),
			isRoot: node.id === rootId,
			left: node.left * unitX,
			top: node.top * unitY,
			width: geometry.slotWidth,
			height: geometry.slotHeight
		};
	});

	const connectors: TreeConnectorVM[] = data.connectors.map((c, i) => ({
		key: `c${i}`,
		x1: c[0] * unitX,
		y1: c[1] * unitY,
		x2: c[2] * unitX,
		y2: c[3] * unitY
	}));

	return {
		width: data.canvas.width * unitX,
		height: data.canvas.height * unitY,
		cards,
		connectors
	};
}

/** The profile shown when a card is clicked. Null for an unknown character. */
export function buildProfile(character: Character | undefined): ProfileVM | null {
	if (!character) return null;
	return {
		id: character.id,
		name: character.name,
		initial: character.name.charAt(0),
		image: character.image,
		accent: accentFor(character),
		house: houseFor(character),
		faction: factionAt(character, FINAL_POSITION),
		aliases: character.aliases,
		facts: character.facts ?? []
	};
}
