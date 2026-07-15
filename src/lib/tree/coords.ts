/**
 * Layout pixel space (top-left origin, x right, y down — what the family-view
 * builders produce) versus three.js world space (y up, camera looking down -Z).
 * This is the sole place that flip lives, mirroring the map's coords.ts.
 *
 * World units are layout pixels 1:1, so at camera zoom 1 the tree renders at
 * exactly the size buildFamilyLayout() computed.
 */

export interface WorldPoint {
	x: number;
	y: number;
	z: number;
}

/** Per-layer world-Z offset, so the cards always sit above the connectors. */
export enum TreeLayerZ {
	Connector = 0,
	Card = 0.01
}

export function toWorld(x: number, y: number, height: number, z: number): WorldPoint {
	return { x, y: height - y, z };
}
