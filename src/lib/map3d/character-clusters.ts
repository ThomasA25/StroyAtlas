import type { Character, Project } from '$lib/core/model';
import type { CharacterId } from '$lib/core/ids';
import { factionAt, type CharacterDeath } from '$lib/core/derive';
import { characterPlacementsAt } from '$lib/core/playback';
import { factionColor } from '$lib/ui/faction-color';
import type { CharacterClusterVM, PersonCategory, TooltipGroup } from './types';

/**
 * Clock-driven character clustering: everyone occupying the same rounded pixel
 * position is merged into one cluster (so names never stack on top of each
 * other), grouped into travelers/stationary/dead for the tooltip. Mirrors the
 * filtering the map page already applies (visibility, kind, faction/house,
 * show-dead/show-stationary toggles).
 */
export interface ClusterFilters {
	isVisible: (id: CharacterId) => boolean;
	kindAllowed: (id: CharacterId) => boolean;
	hiddenFactions: ReadonlySet<string>;
	hiddenHouses: ReadonlySet<string>;
	houseFor: (c: Character) => string;
	showStationary: boolean;
	showDead: boolean;
}

export interface ClusterLabels {
	travelers: string;
	stationary: string;
	dead: string;
}

interface ClusteredPerson {
	name: string;
	faction: string;
	dead: boolean;
	moving: boolean;
}

export function buildCharacterClusters(
	view: Project,
	project: Project,
	t: number,
	deaths: Map<CharacterId, CharacterDeath>,
	filters: ClusterFilters,
	labels: ClusterLabels
): CharacterClusterVM[] {
	const ti = Math.round(t);
	const clusters = new Map<string, { x: number; y: number; people: ClusteredPerson[] }>();

	for (const p of characterPlacementsAt(view, t)) {
		if (!filters.isVisible(p.characterId) || !filters.kindAllowed(p.characterId)) continue;
		const ch = project.characters[p.characterId];
		const name = ch?.name ?? (p.characterId as string);
		const faction = (ch ? factionAt(ch, t) : null) ?? '';
		const house = ch ? filters.houseFor(ch) : '';
		if (faction && filters.hiddenFactions.has(faction)) continue;
		if (house && filters.hiddenHouses.has(house)) continue;

		const death = deaths.get(p.characterId);
		const dead = !!death && ti >= death.orderIndex;
		const moving = p.moving && !dead;
		const stationary = !moving && !dead;
		if (dead && !filters.showDead) continue;
		if (stationary && !filters.showStationary) continue;

		const key = `${Math.round(p.x)},${Math.round(p.y)}`;
		const cluster = clusters.get(key) ?? { x: p.x, y: p.y, people: [] };
		cluster.people.push({ name, faction, dead, moving });
		clusters.set(key, cluster);
	}

	return [...clusters.entries()].map(([key, c]) => toClusterVM(key, c, labels));
}

function dominantCategory(people: ClusteredPerson[]): PersonCategory {
	if (people.every((p) => p.dead)) return 'dead';
	if (people.some((p) => p.moving)) return 'traveling';
	return 'stationary';
}

function toClusterVM(
	key: string,
	c: { x: number; y: number; people: ClusteredPerson[] },
	labels: ClusterLabels
): CharacterClusterVM {
	const travelers = c.people.filter((p) => p.moving);
	const stationary = c.people.filter((p) => !p.moving && !p.dead);
	const dead = c.people.filter((p) => p.dead);
	const buckets: { label: string; dead: boolean; people: ClusteredPerson[] }[] = [
		{ label: labels.travelers, dead: false, people: travelers },
		{ label: labels.stationary, dead: false, people: stationary },
		{ label: labels.dead, dead: true, people: dead }
	].filter((b) => b.people.length > 0);
	const onlyOneGroup = buckets.length === 1;

	const groups: TooltipGroup[] = buckets.map((b) => ({
		label: onlyOneGroup ? '' : b.label,
		lines: b.people.map((p) => ({ text: p.name, color: factionColor(p.faction), dead: b.dead }))
	}));

	return {
		key,
		x: c.x,
		y: c.y,
		count: c.people.length,
		category: dominantCategory(c.people),
		tooltip: { groups }
	};
}
