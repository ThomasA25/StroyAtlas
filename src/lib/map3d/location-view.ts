import type { Project } from '$lib/core/model';
import type { CharacterId } from '$lib/core/ids';
import { movementEdges } from '$lib/core/derive';
import type { LocationMarkerVM, MovementLineVM } from './types';

/** Placed locations, optionally scoped to the active episode range. */
export function buildLocationMarkers(
	project: Project,
	episodeLocationIds: ReadonlySet<string> | null
): LocationMarkerVM[] {
	const markers: LocationMarkerVM[] = [];
	for (const loc of Object.values(project.locations)) {
		if (loc.coordinates.x == null || loc.coordinates.y == null) continue;
		if (episodeLocationIds && !episodeLocationIds.has(loc.id)) continue;
		markers.push({ id: loc.id, name: loc.name, x: loc.coordinates.x, y: loc.coordinates.y });
	}
	return markers;
}

/** Character movement edges, resolved to placed location coordinates. */
export function buildMovementLines(
	view: Project,
	project: Project,
	isVisible: (id: CharacterId) => boolean,
	kindAllowed: (id: CharacterId) => boolean
): MovementLineVM[] {
	const lines: MovementLineVM[] = [];
	for (const edge of movementEdges(view)) {
		if (!isVisible(edge.characterId) || !kindAllowed(edge.characterId)) continue;
		const a = project.locations[edge.fromLocationId];
		const b = project.locations[edge.toLocationId];
		if (!a || a.coordinates.x == null || a.coordinates.y == null) continue;
		if (!b || b.coordinates.x == null || b.coordinates.y == null) continue;
		lines.push({
			characterId: edge.characterId,
			from: { x: a.coordinates.x, y: a.coordinates.y },
			to: { x: b.coordinates.x, y: b.coordinates.y }
		});
	}
	return lines;
}
