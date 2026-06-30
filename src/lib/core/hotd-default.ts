import { emptyProject, type Project } from './model';
import { extractionContract } from './contract';
import { characterDeaths } from './derive';
import type { CharacterId } from './ids';
import { mergeExtractionInto, nextOrderOffset } from '$lib/extraction/from-extraction';
import type { Locale } from '$lib/i18n/messages';

/**
 * Locale-specific House of the Dragon episode files. They live under /data
 * (outside src), so the globs walk up to the project root; both sets are eagerly
 * bundled at build time (no runtime fetch) and parsed as their default JSON
 * export. English keeps the original path; German lives under /de.
 */
const episodeModules: Record<Locale, Record<string, unknown>> = {
	en: import.meta.glob('../../../data/hotd/episodes/*.json', {
		eager: true,
		import: 'default'
	}) as Record<string, unknown>,
	de: import.meta.glob('../../../data/hotd/de/episodes/*.json', {
		eager: true,
		import: 'default'
	}) as Record<string, unknown>
};

/** Title stamped on the auto-seeded default, per locale — used to detect a seed. */
const TITLES: Record<Locale, string> = {
	en: 'House of the Dragon (S1–S3E1)',
	de: 'House of the Dragon (S1–S3F1)'
};

const DEFAULT_TITLES = Object.values(TITLES);

/**
 * Dragons, modelled as characters that ride along with their rider. Each dragon
 * is added to every scene its rider appears in (so it shares the rider's place
 * and movement), gets the rider's allegiance as its faction, and — for the three
 * dragons that fall in battle — dies in the same event as its rider.
 */
interface DragonDef {
	id: string;
	riders: string[];
	faction: 'Blacks' | 'Greens';
	en: string;
	de: string;
	/** Rider whose death event also kills this dragon. */
	diesWith?: string;
}
const DRAGONS: DragonDef[] = [
	{ id: 'caraxes', riders: ['daemon-targaryen'], faction: 'Blacks', en: 'Caraxes', de: 'Caraxes' },
	{ id: 'syrax', riders: ['rhaenyra-targaryen'], faction: 'Blacks', en: 'Syrax', de: 'Syrax' },
	{
		id: 'vhagar',
		riders: ['aemond-targaryen', 'laena-velaryon'],
		faction: 'Greens',
		en: 'Vhagar',
		de: 'Vhagar'
	},
	{
		id: 'vermax',
		riders: ['jacaerys-velaryon'],
		faction: 'Blacks',
		en: 'Vermax',
		de: 'Vermax',
		diesWith: 'jacaerys-velaryon'
	},
	{
		id: 'arrax',
		riders: ['lucerys-velaryon'],
		faction: 'Blacks',
		en: 'Arrax',
		de: 'Arrax',
		diesWith: 'lucerys-velaryon'
	},
	{
		id: 'meleys',
		riders: ['rhaenys-targaryen'],
		faction: 'Blacks',
		en: 'Meleys',
		de: 'Meleys',
		diesWith: 'rhaenys-targaryen'
	},
	{ id: 'sunfyre', riders: ['aegon-ii-targaryen'], faction: 'Greens', en: 'Sunfyre', de: 'Sunfyre' },
	{
		id: 'dreamfyre',
		riders: ['helaena-targaryen'],
		faction: 'Greens',
		en: 'Dreamfyre',
		de: 'Traumfeuer'
	},
	{
		id: 'moondancer',
		riders: ['baela-targaryen'],
		faction: 'Blacks',
		en: 'Moondancer',
		de: 'Mondtänzerin'
	},
	{ id: 'seasmoke', riders: ['addam-of-hull'], faction: 'Blacks', en: 'Seasmoke', de: 'Seerauch' },
	{ id: 'vermithor', riders: ['hugh-hammer'], faction: 'Blacks', en: 'Vermithor', de: 'Vermithor' },
	{ id: 'silverwing', riders: ['ulf-white'], faction: 'Blacks', en: 'Silverwing', de: 'Silberflügel' },
	{
		id: 'sheepstealer',
		riders: ['rhaena-targaryen'],
		faction: 'Blacks',
		en: 'Sheepstealer',
		de: 'Schafsdieb'
	}
];

/** Canonical ids of all dragons — lets views distinguish dragons from people. */
export const DRAGON_IDS: ReadonlySet<string> = new Set(DRAGONS.map((d) => d.id));

/** Inject dragons into a freshly-seeded project (see DRAGONS). */
function addDragons(project: Project, locale: Locale): void {
	const factionLabel = (f: 'Blacks' | 'Greens') =>
		locale === 'de' ? (f === 'Blacks' ? 'Schwarze' : 'Grüne') : f;
	const byRider = new Map<string, DragonDef>();
	for (const d of DRAGONS) for (const r of d.riders) byRider.set(r, d);

	const used = new Set<string>();
	for (const scene of Object.values(project.scenes)) {
		for (const cid of [...scene.characters]) {
			const dragon = byRider.get(cid as string);
			if (!dragon) continue;
			used.add(dragon.id);
			if (!scene.characters.includes(dragon.id as CharacterId)) {
				scene.characters.push(dragon.id as CharacterId);
			}
		}
	}

	for (const d of DRAGONS) {
		if (!used.has(d.id)) continue;
		project.characters[d.id as CharacterId] = {
			id: d.id as CharacterId,
			name: locale === 'de' ? d.de : d.en,
			faction: factionLabel(d.faction),
			aliases: [],
			kind: 'dragon',
			origin: 'extracted'
		};
	}

	// A dragon dies in the same event as its rider.
	const deaths = characterDeaths(project);
	for (const d of DRAGONS) {
		if (!d.diesWith || !used.has(d.id)) continue;
		const riderDeath = deaths.get(d.diesWith as CharacterId);
		if (!riderDeath) continue;
		const event = project.events[riderDeath.eventId];
		if (event) event.deaths = [...(event.deaths ?? []), d.id as CharacterId];
	}
}

/**
 * Build the default House of the Dragon project for a locale by running every
 * episode file through the real extraction pipeline (Zod contract gate ->
 * mergeExtractionInto with stacked order offsets), exactly as the hotd-import
 * spec does. Seeded as the working project on first run / language switch.
 */
export function hotdDefaultProject(locale: Locale): Project {
	const project = emptyProject();
	project.meta = {
		series: 'House of the Dragon',
		season: null,
		episode: null,
		title: TITLES[locale]
	};
	// Fictional Westeros base map (static asset). Location pixel coordinates in
	// the dataset live in this image's 1000×1100 space, so markers land in place.
	project.map = { imageUrl: '/westeros.svg', width: 1000, height: 1100 };
	const modules = episodeModules[locale];
	for (const path of Object.keys(modules).sort()) {
		const result = extractionContract.parse(modules[path]);
		mergeExtractionInto(project, result, { orderOffset: nextOrderOffset(project) });
	}
	addDragons(project, locale);
	return project;
}

/**
 * True when the project is still an untouched auto-seeded default (any locale,
 * including an earlier seed that predates episode tagging). Such a project can
 * be safely replaced — by a fresh seed or a different-language seed — whereas a
 * user-renamed project is left alone. Matches only the auto-seed titles.
 */
export function isHotdDefault(project: Project): boolean {
	return DEFAULT_TITLES.includes(project.meta.title);
}
