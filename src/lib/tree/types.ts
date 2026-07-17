import type { CharacterId } from '$lib/core/ids';

/**
 * View-model types for the family tree (/tree) — plain, presentational data
 * produced by the pure builders in family-view.ts and consumed by the Svelte
 * components. Every position is already resolved to pixels, so the components do
 * no layout maths of their own. Kept separate from the canonical model
 * (model.ts) since these shapes exist only for rendering.
 */

/**
 * Pixel size of one card slot. A relatives-tree layout is expressed in grid
 * units where a node spans SIZE (=2) units, so one unit is half a slot — that is
 * the factor which turns unit coordinates into pixels. Slots are deliberately
 * larger than the cards drawn inside them; the surplus is the gap between cards.
 */
export interface TreeGeometry {
	slotWidth: number;
	slotHeight: number;
}

export const DEFAULT_GEOMETRY: TreeGeometry = { slotWidth: 184, slotHeight: 168 };

/** A house present in the tree with its members — the family picker's options. */
export interface FamilyGroupVM {
	house: string;
	memberIds: CharacterId[];
}

/** One positioned character card. */
export interface TreeCardVM {
	/**
	 * Unique per rendered position. A character can legitimately appear at several
	 * spots (e.g. Aegon II as both Viserys' son and his sister Helaena's husband),
	 * so the character id alone is not a usable key — the grid position completes it.
	 */
	key: string;
	id: CharacterId;
	name: string;
	/** Faction colour for the card's accent border. */
	accent: string;
	isRoot: boolean;
	left: number;
	top: number;
	width: number;
	height: number;
}

/** One tree connector segment (always horizontal or vertical). */
export interface TreeConnectorVM {
	key: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface FamilyLayoutVM {
	width: number;
	height: number;
	cards: TreeCardVM[];
	connectors: TreeConnectorVM[];
}

/** A character's profile, as shown in the card modal. */
export interface ProfileVM {
	id: CharacterId;
	name: string;
	/** First letter, standing in for the portrait when no `image` is set. */
	initial: string;
	/** Portrait image URL; falls back to `initial` when absent. */
	image?: string;
	accent: string;
	house: string;
	faction: string | null;
	aliases: string[];
	/** Short bullet-point facts (see Character.facts). */
	facts: string[];
}
