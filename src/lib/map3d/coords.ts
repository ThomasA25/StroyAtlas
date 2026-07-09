/**
 * Pixel space (top-left origin, x right, y down — the fictional map image's own
 * coordinate system, as stored on `Location.coordinates`) versus three.js world
 * space (y up, camera looking down -Z). This is the sole place that flip lives,
 * replacing the old Leaflet `toLatLng`.
 */

export interface WorldPoint {
	x: number;
	y: number;
	z: number;
}

/** Per-layer world-Z offset — replaces Leaflet's pane stacking order. */
export enum MapLayerZ {
	Base = 0,
	Movement = 0.01,
	DeathTrail = 0.02,
	Location = 0.03,
	Character = 0.04,
	Badge = 0.05
}

export function toWorld(x: number, y: number, height: number, z: number): WorldPoint {
	return { x, y: height - y, z };
}

/** Inverse of toWorld's x/y flip — used to resolve a click/drag back to pixel space. */
export function toPixel(worldX: number, worldY: number, height: number): { x: number; y: number } {
	return { x: worldX, y: height - worldY };
}
