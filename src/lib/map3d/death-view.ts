import type { Project } from '$lib/core/model';
import type { CharacterId, LocationId } from '$lib/core/ids';
import type { CharacterDeath } from '$lib/core/derive';
import type { Waypoint } from '$lib/core/playback';
import type { DeathBadgeVM, DeathTrailVM, TooltipGroup } from './types';

/**
 * Once the clock reaches a death, the character's route up to that point draws
 * as a trail, and a per-location badge tallies how many died there (so skulls
 * don't stack on one spot).
 */
export function buildDeathTrails(
	project: Project,
	t: number,
	deaths: Map<CharacterId, CharacterDeath>,
	waypoints: Map<CharacterId, Waypoint[]>,
	isVisible: (id: CharacterId) => boolean,
	kindAllowed: (id: CharacterId) => boolean
): DeathTrailVM[] {
	const ti = Math.round(t);
	const trails: DeathTrailVM[] = [];
	for (const death of deaths.values()) {
		if (!isVisible(death.characterId) || !kindAllowed(death.characterId)) continue;
		if (ti < death.orderIndex || !death.locationId) continue;
		const loc = project.locations[death.locationId];
		if (!loc || loc.coordinates.x == null || loc.coordinates.y == null) continue;
		const end = { x: loc.coordinates.x, y: loc.coordinates.y };

		const wps = (waypoints.get(death.characterId) ?? []).filter(
			(w) => w.orderIndex <= death.orderIndex
		);
		const points = wps.map((w) => ({ x: w.x, y: w.y }));
		const last = points[points.length - 1];
		if (!last || last.x !== end.x || last.y !== end.y) points.push(end);
		if (points.length >= 2) trails.push({ characterId: death.characterId, points });
	}
	return trails;
}

export function buildDeathBadges(
	project: Project,
	t: number,
	deaths: Map<CharacterId, CharacterDeath>,
	isVisible: (id: CharacterId) => boolean,
	kindAllowed: (id: CharacterId) => boolean,
	deathByLabel: string
): DeathBadgeVM[] {
	const ti = Math.round(t);
	const byLoc = new Map<LocationId, { x: number; y: number; groups: TooltipGroup['lines'] }>();

	for (const death of deaths.values()) {
		if (!isVisible(death.characterId) || !kindAllowed(death.characterId)) continue;
		if (ti < death.orderIndex || !death.locationId) continue;
		const loc = project.locations[death.locationId];
		if (!loc || loc.coordinates.x == null || loc.coordinates.y == null) continue;

		const name = project.characters[death.characterId]?.name ?? (death.characterId as string);
		const killer = death.killerId ? (project.characters[death.killerId]?.name ?? null) : null;
		const text = killer ? `${name} — ${deathByLabel} ${killer}` : name;

		const entry = byLoc.get(death.locationId) ?? {
			x: loc.coordinates.x,
			y: loc.coordinates.y,
			groups: []
		};
		entry.groups.push({ text, color: '', dead: true });
		byLoc.set(death.locationId, entry);
	}

	return [...byLoc.entries()].map(([locationId, g]) => ({
		locationId,
		x: g.x,
		y: g.y,
		count: g.groups.length,
		tooltip: { groups: [{ label: '', lines: g.groups }] }
	}));
}
