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
			riderIds: d.riders.map((r) => r as CharacterId),
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
 * The two war parties (Blacks/Greens) only crystallize at Aegon II's coronation
 * in the Green Council (S1E9) — the start of the Dance of the Dragons. Before
 * then every partisan stands at the royal court (Neutral); from the coronation
 * onward they take the side the dataset records. Modelled as a per-character
 * allegiance switch (see model.AllegianceChange) so the map and graph recolour
 * as the timeline crosses the coronation. Characters the dataset already marks
 * Neutral (and those with no faction) are left untouched.
 */
const NEUTRAL_FACTION = 'Neutral'; // same label in both the en and de datasets
function applyCoronationSplit(project: Project): void {
	let coronationOrder = Infinity;
	for (const scene of Object.values(project.scenes)) {
		if (scene.season === 1 && scene.episode === 9) {
			coronationOrder = Math.min(coronationOrder, scene.orderIndex);
		}
	}
	if (!Number.isFinite(coronationOrder)) return; // dataset without S1E9
	for (const character of Object.values(project.characters)) {
		if (!character.faction || character.faction === NEUTRAL_FACTION) continue;
		character.allegiances = [{ orderIndex: coronationOrder, faction: character.faction }];
		character.faction = NEUTRAL_FACTION;
	}
}

/**
 * Per-death context for the seeded deaths — who dealt it, how, and with what —
 * read straight from each killing event's own summary (no invented facts).
 * Keyed by the dying character's canonical id (= name slug). Cause/weapon are
 * localized; the killer is a character id (locale-independent).
 */
interface DeathFact {
	killer?: string | null;
	cause: { en: string; de: string };
	weapon?: { en: string; de: string };
}
const DEATH_DETAILS: Record<string, DeathFact> = {
	'aemma-arryn': {
		killer: 'viserys-i-targaryen',
		cause: { en: 'Died during the forced birth Viserys ordered to try to save the babe.', de: 'Starb bei der von Viserys angeordneten Schnittgeburt, die das Kind retten sollte.' },
		weapon: { en: "Maester's blade (forced birth)", de: 'Maester-Klinge (Schnittgeburt)' }
	},
	'craghas-drahar': {
		killer: 'daemon-targaryen',
		cause: { en: 'Cut down by Daemon in the storming of the Stepstones.', de: 'Von Daemon bei der Erstürmung der Stepstones niedergestreckt.' },
		weapon: { en: 'Sword (Dark Sister)', de: 'Schwert (Dunkle Schwester)' }
	},
	'rhea-royce': {
		killer: 'daemon-targaryen',
		cause: { en: 'Left for dead by Daemon in the Vale after a fall from her horse.', de: 'Von Daemon im Tal nach einem Sturz vom Pferd dem Tod überlassen.' },
		weapon: { en: 'Blunt force (a rock)', de: 'Stumpfe Gewalt (ein Stein)' }
	},
	'joffrey-lonmouth': {
		killer: 'criston-cole',
		cause: { en: 'Beaten to death by Criston Cole at the wedding feast.', de: 'Von Criston Cole beim Hochzeitsfest zu Tode geprügelt.' },
		weapon: { en: 'Fists', de: 'Fäuste' }
	},
	'laena-velaryon': {
		killer: 'vhagar',
		cause: { en: 'After a failed labour, commanded her own dragon to end her life.', de: 'Nach einer gescheiterten Geburt befahl sie ihrem eigenen Drachen, sie zu töten.' },
		weapon: { en: 'Dragonfire (Vhagar)', de: 'Drachenfeuer (Vhagar)' }
	},
	'lyonel-strong': {
		killer: 'larys-strong',
		cause: { en: 'Burned in the Harrenhal fire his son Larys arranged.', de: 'Im von seinem Sohn Larys gelegten Brand von Harrenhal verbrannt.' },
		weapon: { en: 'Fire (arson)', de: 'Feuer (Brandstiftung)' }
	},
	'harwin-strong': {
		killer: 'larys-strong',
		cause: { en: 'Burned in the Harrenhal fire his brother Larys arranged.', de: 'Im von seinem Bruder Larys gelegten Brand von Harrenhal verbrannt.' },
		weapon: { en: 'Fire (arson)', de: 'Feuer (Brandstiftung)' }
	},
	'lyman-beesbury': {
		killer: 'criston-cole',
		cause: { en: 'Killed by Criston Cole at the council table for opposing the coup.', de: 'Von Criston Cole am Ratstisch getötet, weil er sich dem Putsch widersetzte.' },
		weapon: { en: 'Blunt force (struck down)', de: 'Stumpfe Gewalt (erschlagen)' }
	},
	'vaemond-velaryon': {
		killer: 'daemon-targaryen',
		cause: { en: 'Beheaded by Daemon for slandering Rhaenyra before the court.', de: 'Von Daemon enthauptet, weil er Rhaenyra bei Hofe verleumdete.' },
		weapon: { en: 'Sword', de: 'Schwert' }
	},
	'viserys-i-targaryen': {
		killer: null,
		cause: { en: 'Died of the long, wasting illness that consumed him.', de: 'Starb an der langen, zehrenden Krankheit, die ihn verzehrte.' }
	},
	'jaehaerys-targaryen': {
		killer: 'blood',
		cause: { en: 'Murdered in his chambers by the assassins Blood and Cheese.', de: 'In seinen Gemächern von den Mördern Blood und Cheese ermordet.' },
		weapon: { en: 'Blade (beheaded)', de: 'Klinge (enthauptet)' }
	},
	'lucerys-velaryon': {
		killer: 'aemond-targaryen',
		cause: { en: 'He and his dragon Arrax were caught and devoured by Vhagar over Storm’s End.', de: 'Er und sein Drache Arrax wurden über Sturmkap von Vhagar gefasst und verschlungen.' },
		weapon: { en: 'Dragon (Vhagar)', de: 'Drache (Vhagar)' }
	},
	arrax: {
		killer: 'aemond-targaryen',
		cause: { en: 'Caught and killed by Vhagar over Storm’s End.', de: 'Über Sturmkap von Vhagar gefasst und getötet.' },
		weapon: { en: 'Dragon (Vhagar)', de: 'Drache (Vhagar)' }
	},
	'arryk-cargyll': {
		killer: 'erryk-cargyll',
		cause: { en: 'Slain by his twin Erryk in their duel to the death on Dragonstone.', de: 'Von seinem Zwilling Erryk im Duell auf Drachenstein getötet.' },
		weapon: { en: 'Sword', de: 'Schwert' }
	},
	'erryk-cargyll': {
		killer: 'arryk-cargyll',
		cause: { en: 'Slain by his twin Arryk in their duel to the death on Dragonstone.', de: 'Von seinem Zwilling Arryk im Duell auf Drachenstein getötet.' },
		weapon: { en: 'Sword', de: 'Schwert' }
	},
	'gunthor-darklyn': {
		killer: 'criston-cole',
		cause: { en: 'Beheaded by Criston Cole after Duskendale fell.', de: 'Von Criston Cole nach dem Fall von Duskendale enthauptet.' },
		weapon: { en: 'Sword', de: 'Schwert' }
	},
	'rhaenys-targaryen': {
		killer: 'aemond-targaryen',
		cause: { en: 'She and her dragon Meleys were brought down by Vhagar at Rook’s Rest.', de: 'Sie und ihr Drache Meleys wurden bei Rook’s Rest von Vhagar niedergerungen.' },
		weapon: { en: 'Dragonfire (Vhagar)', de: 'Drachenfeuer (Vhagar)' }
	},
	meleys: {
		killer: 'aemond-targaryen',
		cause: { en: 'Brought down by Vhagar at the Battle of Rook’s Rest.', de: 'In der Schlacht von Rook’s Rest von Vhagar niedergerungen.' },
		weapon: { en: 'Dragonfire (Vhagar)', de: 'Drachenfeuer (Vhagar)' }
	},
	'willem-blackwood': {
		killer: 'daemon-targaryen',
		cause: { en: 'Executed by Daemon to satisfy the new Riverlands liege Oscar Tully.', de: 'Von Daemon hingerichtet, um den neuen Flusslande-Lehnsherrn Oscar Tully zu besänftigen.' },
		weapon: { en: 'Sword (execution)', de: 'Schwert (Hinrichtung)' }
	},
	'jason-lannister': {
		killer: 'daemon-targaryen',
		cause: { en: 'Slain in Daemon’s victory in the Riverlands; his severed head was presented by Roderick Dustin.', de: 'In Daemons Sieg in den Flusslanden getötet; sein abgeschlagener Kopf wurde von Roderick Dustin überbracht.' },
		weapon: { en: 'Sword (beheaded in battle)', de: 'Schwert (in der Schlacht enthauptet)' }
	},
	'jacaerys-velaryon': {
		killer: null,
		cause: { en: 'Shot down and killed at the Battle of the Gullet.', de: 'In der Schlacht im Schlund abgeschossen und getötet.' },
		weapon: { en: 'Scorpion bolts', de: 'Skorpionbolzen' }
	},
	vermax: {
		killer: null,
		cause: { en: 'Shot down with Jacaerys at the Battle of the Gullet.', de: 'Mit Jacaerys in der Schlacht im Schlund abgeschossen.' },
		weapon: { en: 'Scorpion bolts', de: 'Skorpionbolzen' }
	}
};

/** Attach DEATH_DETAILS to the killing events of the seeded project (see above). */
function applyDeathDetails(project: Project, locale: Locale): void {
	const pick = (t?: { en: string; de: string }) => (t ? (locale === 'de' ? t.de : t.en) : undefined);
	for (const event of Object.values(project.events)) {
		if (!event.deaths) continue;
		for (const id of event.deaths) {
			const fact = DEATH_DETAILS[id as string];
			if (!fact) continue;
			(event.deathDetails ??= {})[id] = {
				killerId: (fact.killer ?? null) as CharacterId | null,
				cause: pick(fact.cause),
				weapon: pick(fact.weapon)
			};
		}
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
	applyDeathDetails(project, locale);
	applyCoronationSplit(project);
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
