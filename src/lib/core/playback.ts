import type { Project } from './model';
import type { CharacterId } from './ids';
import { timelineScenes } from './derive';

/**
 * Playback geometry — turns the timeline position (an order_index value `t`,
 * possibly fractional) into character positions on the map. Pure, so the
 * animation engine can interpolate reactively and we can unit-test the math.
 */

export interface Waypoint {
	orderIndex: number;
	x: number;
	y: number;
}
export interface CharacterPosition {
	characterId: CharacterId;
	x: number;
	y: number;
}

export function timelineBounds(project: Project): { min: number; max: number } {
	const scenes = Object.values(project.scenes);
	if (scenes.length === 0) return { min: 0, max: 0 };
	let min = Infinity;
	let max = -Infinity;
	for (const s of scenes) {
		min = Math.min(min, s.orderIndex);
		max = Math.max(max, s.orderIndex);
	}
	return { min, max };
}

/** Per-character ordered waypoints, from located scenes whose location has coords. */
export function characterWaypoints(project: Project): Map<CharacterId, Waypoint[]> {
	const result = new Map<CharacterId, Waypoint[]>();
	for (const scene of timelineScenes(project)) {
		if (scene.locationId == null) continue;
		const loc = project.locations[scene.locationId];
		if (!loc || loc.coordinates.x == null || loc.coordinates.y == null) continue;
		const wp: Waypoint = { orderIndex: scene.orderIndex, x: loc.coordinates.x, y: loc.coordinates.y };
		for (const c of scene.characters) {
			const list = result.get(c);
			if (list) list.push(wp);
			else result.set(c, [wp]);
		}
	}
	return result;
}

/** Interpolated position along a character's waypoints at timeline position `t`. */
export function positionAt(waypoints: Waypoint[], t: number): { x: number; y: number } | null {
	if (waypoints.length === 0) return null;
	const first = waypoints[0];
	const last = waypoints[waypoints.length - 1];
	if (!first || !last) return null;
	if (t <= first.orderIndex) return { x: first.x, y: first.y };
	if (t >= last.orderIndex) return { x: last.x, y: last.y };
	for (let i = 1; i < waypoints.length; i++) {
		const a = waypoints[i - 1];
		const b = waypoints[i];
		if (!a || !b) continue;
		if (t >= a.orderIndex && t <= b.orderIndex) {
			const span = b.orderIndex - a.orderIndex;
			const f = span === 0 ? 0 : (t - a.orderIndex) / span;
			return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
		}
	}
	return { x: last.x, y: last.y };
}

export function characterPositionsAt(project: Project, t: number): CharacterPosition[] {
	const out: CharacterPosition[] = [];
	for (const [characterId, waypoints] of characterWaypoints(project)) {
		const pos = positionAt(waypoints, t);
		if (pos) out.push({ characterId, x: pos.x, y: pos.y });
	}
	return out;
}

/** True when `t` falls strictly inside a segment connecting two different places
 * — i.e. the character is currently in transit rather than resting at a spot. */
export function movingAt(waypoints: Waypoint[], t: number): boolean {
	if (waypoints.length < 2) return false;
	const first = waypoints[0]!;
	const last = waypoints[waypoints.length - 1]!;
	if (t <= first.orderIndex || t >= last.orderIndex) return false;
	for (let i = 1; i < waypoints.length; i++) {
		const a = waypoints[i - 1]!;
		const b = waypoints[i]!;
		if (t > a.orderIndex && t < b.orderIndex) return a.x !== b.x || a.y !== b.y;
	}
	return false; // sitting exactly on a waypoint
}

export interface CharacterPlacement extends CharacterPosition {
	moving: boolean;
}

/** Character positions plus whether each is currently travelling. */
export function characterPlacementsAt(project: Project, t: number): CharacterPlacement[] {
	const out: CharacterPlacement[] = [];
	for (const [characterId, waypoints] of characterWaypoints(project)) {
		const pos = positionAt(waypoints, t);
		if (pos) out.push({ characterId, x: pos.x, y: pos.y, moving: movingAt(waypoints, t) });
	}
	return out;
}

/** Characters appearing in scenes at the (rounded) current order index. */
export function activeCharactersAt(project: Project, t: number): Set<CharacterId> {
	const idx = Math.round(t);
	const active = new Set<CharacterId>();
	for (const scene of Object.values(project.scenes)) {
		if (scene.orderIndex === idx) for (const c of scene.characters) active.add(c);
	}
	return active;
}
