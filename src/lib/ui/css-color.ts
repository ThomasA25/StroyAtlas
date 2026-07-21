/**
 * Three.js materials can't consume CSS custom properties directly the way
 * SVG/CSS rendering can. This reads a CSS variable's live computed value so it
 * can be handed to a THREE.Color. Shared by the map3d and tree scenes. The app's
 * theme only changes via the OS `prefers-color-scheme` media query (no in-app
 * toggle), but callers can still re-invoke this on a `matchMedia` change
 * listener if it flips mid-session.
 */
export function readCssVar(el: Element, name: string, fallback = '#ffffff'): string {
	const value = getComputedStyle(el).getPropertyValue(name).trim();
	return value || fallback;
}
