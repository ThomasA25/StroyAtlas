import type { CharacterId, LocationId } from '$lib/core/ids';

/**
 * View-model types for the map3d layer — plain, presentational data produced by
 * the pure builder functions (location-view.ts / character-clusters.ts /
 * death-view.ts) and consumed by the Threlte components. Kept separate from the
 * canonical model (model.ts) since these shapes exist only for rendering.
 */

/** A person's dominant activity at the current timeline position. */
export type PersonCategory = 'traveling' | 'stationary' | 'dead';

/** Marker colour per dominant category — was hardcoded hex literals inline. */
export const CATEGORY_COLOR: Record<PersonCategory, string> = {
	dead: '#8a8a93',
	traveling: '#e0a23a',
	stationary: '#5aa9e6'
};

export const DEATH_TRAIL_COLOR = '#d23b3b';
export const DEATH_BADGE_COLOR = '#d23b3b';

/** One colour-tinted line of tooltip text (a person's name, faction-tinted). */
export interface TooltipLine {
	text: string;
	color: string;
	/** Marks a death line so it can be prefixed with a dagger, e.g. "† Name". */
	dead?: boolean;
}

/** A labelled section of a tooltip (e.g. "Travelers" / "Stationary" / "Dead"). */
export interface TooltipGroup {
	label: string;
	lines: TooltipLine[];
}

/** Structured tooltip content — rendered by MapTooltip.svelte via normal Svelte
 * templating, so no manual HTML-escaping is needed (unlike the old Leaflet
 * HTML-string tooltips). */
export interface TooltipContent {
	groups: TooltipGroup[];
}

export interface LocationMarkerVM {
	id: LocationId;
	name: string;
	x: number;
	y: number;
}

export interface MovementLineVM {
	characterId: CharacterId;
	from: { x: number; y: number };
	to: { x: number; y: number };
}

export interface CharacterClusterVM {
	/** Stable key derived from the rounded pixel position. */
	key: string;
	x: number;
	y: number;
	count: number;
	category: PersonCategory;
	/** True when every character sharing this spot is a dragon (kind:'dragon'). */
	allDragons: boolean;
	/** True when at least one character sharing this spot is a dragon (e.g. a rider + their dragon). */
	hasDragon: boolean;
	/** CSS rotation (degrees, clockwise) so the dragon icon's head faces its
	 * flight direction; null when no dragon here is currently in transit. */
	dragonAngleDeg: number | null;
	tooltip: TooltipContent;
}

export interface DeathTrailVM {
	characterId: CharacterId;
	points: { x: number; y: number }[];
}

export interface DeathBadgeVM {
	locationId: LocationId;
	x: number;
	y: number;
	count: number;
	tooltip: TooltipContent;
}
