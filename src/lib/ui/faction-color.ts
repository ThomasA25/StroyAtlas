/**
 * Faction → colour, shared by the graph (node fill) and the map (name labels /
 * tooltips) so allegiance reads the same everywhere. Semantic colours cover the
 * House of the Dragon parties in both locales (en + de labels); any other
 * faction gets a stable hue hashed from its name, and an empty/neutral value
 * falls back to grey.
 */
const FACTION_COLORS: Record<string, string> = {
	greens: '#4caf50',
	grüne: '#4caf50',
	blacks: '#c0413a',
	schwarze: '#c0413a',
	neutral: '#9098a6'
};

export function factionColor(faction: string | null | undefined): string {
	if (!faction) return FACTION_COLORS.neutral;
	const key = faction.toLowerCase();
	if (FACTION_COLORS[key]) return FACTION_COLORS[key];
	let h = 0;
	for (const ch of faction) h = (h * 31 + ch.charCodeAt(0)) % 360;
	return `hsl(${h} 55% 55%)`;
}
