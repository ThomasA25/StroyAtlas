import { emptyProject, type Project } from './model';
import { extractionContract } from './contract';
import { characterDeaths } from './derive';
import type { CharacterId, LocationId } from './ids';
import { mergeExtractionInto, nextOrderOffset } from '$lib/extraction/from-extraction';
import type { Locale } from '$lib/i18n/messages';
import locationCoordinatesJson from '../../../data/hotd/location-coordinates.json';

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
	/** Size relative to an average adult dragon (1 = average), from Fire &
	 * Blood/show lore — e.g. Vhagar is the largest living dragon of the era,
	 * Moondancer "never grew larger than a horse". Purely cosmetic (map marker
	 * size), so approximate rankings are fine where sources disagree. */
	sizeScale: number;
}
const DRAGONS: DragonDef[] = [
	{
		id: 'caraxes',
		riders: ['daemon-targaryen'],
		faction: 'Blacks',
		en: 'Caraxes',
		de: 'Caraxes',
		sizeScale: 1.1 // "the Blood Wyrm" — long and serpentine, said to be about half Vhagar's size
	},
	{
		id: 'syrax',
		riders: ['rhaenyra-targaryen'],
		faction: 'Blacks',
		en: 'Syrax',
		de: 'Syrax',
		sizeScale: 1.0 // large but plump/battle-untested; slightly smaller than Meleys
	},
	{
		id: 'vhagar',
		riders: ['aemond-targaryen', 'laena-velaryon'],
		faction: 'Greens',
		en: 'Vhagar',
		de: 'Vhagar',
		sizeScale: 1.5 // largest living dragon of the era, ~200 years old
	},
	{
		id: 'vermax',
		riders: ['jacaerys-velaryon'],
		faction: 'Blacks',
		en: 'Vermax',
		de: 'Vermax',
		diesWith: 'jacaerys-velaryon',
		sizeScale: 0.75 // young, still growing — one of the larger "young dragons"
	},
	{
		id: 'arrax',
		riders: ['lucerys-velaryon'],
		faction: 'Blacks',
		en: 'Arrax',
		de: 'Arrax',
		diesWith: 'lucerys-velaryon',
		sizeScale: 0.7 // young dragon, killed early in the war by Vhagar
	},
	{
		id: 'meleys',
		riders: ['rhaenys-targaryen'],
		faction: 'Blacks',
		en: 'Meleys',
		de: 'Meleys',
		diesWith: 'rhaenys-targaryen',
		sizeScale: 1.05 // "the Red Queen" — very large and the fastest dragon alive
	},
	{
		id: 'sunfyre',
		riders: ['aegon-ii-targaryen'],
		faction: 'Greens',
		en: 'Sunfyre',
		de: 'Sunfyre',
		sizeScale: 0.9 // comparable to Seasmoke, smaller than Syrax
	},
	{
		id: 'dreamfyre',
		riders: ['helaena-targaryen'],
		faction: 'Greens',
		en: 'Dreamfyre',
		de: 'Traumfeuer',
		sizeScale: 1.2 // one of the eldest dragons, sized just behind Vermithor
	},
	{
		id: 'moondancer',
		riders: ['baela-targaryen'],
		faction: 'Blacks',
		en: 'Moondancer',
		de: 'Mondtänzerin',
		sizeScale: 0.55 // smallest dragon alive during the Dance — never bigger than a horse
	},
	{
		id: 'seasmoke',
		riders: ['addam-of-hull'],
		faction: 'Blacks',
		en: 'Seasmoke',
		de: 'Seerauch',
		sizeScale: 0.9 // comparable to Sunfyre, smaller than Syrax
	},
	{
		id: 'vermithor',
		riders: ['hugh-hammer'],
		faction: 'Blacks',
		en: 'Vermithor',
		de: 'Vermithor',
		sizeScale: 1.35 // "the Bronze Fury" — second-largest dragon in Westeros after Vhagar
	},
	{
		id: 'silverwing',
		riders: ['ulf-white'],
		faction: 'Blacks',
		en: 'Silverwing',
		de: 'Silberflügel',
		sizeScale: 1.3 // close in age to Vermithor, presumed similarly large by the Dance
	},
	{
		id: 'sheepstealer',
		riders: ['rhaena-targaryen'],
		faction: 'Blacks',
		en: 'Sheepstealer',
		de: 'Schafsdieb',
		sizeScale: 0.85 // wild and "skinny", but large enough to take on two young dragons at once
	}
];

/** Canonical ids of all dragons — lets views distinguish dragons from people. */
export const DRAGON_IDS: ReadonlySet<string> = new Set(DRAGONS.map((d) => d.id));

/**
 * Dynastic family relationships for the main characters, powering the /tree
 * family tree. This is HotD-specific enrichment the generic extraction model
 * can't infer (like DRAGONS/DEATH_DETAILS): only parent and spouse edges are
 * recorded — children and siblings are derived from them (see derive.familyTree).
 * Ids are the canonical name slugs already used across the dataset. Only the
 * Targaryen/Velaryon/Hightower core is modelled; everyone else stays off the tree.
 *
 * A few deliberate simplifications keep the tree grounded in characters the
 * dataset actually contains: Rhaenyra's three eldest are attached to her consort
 * Laenor (their official father), and the Hull brothers to Corlys (their rumoured
 * sire) — ancestors not present in the data (Baelon, Aemon, …) are simply omitted.
 */
interface FamilyDef {
	id: string;
	gender: 'male' | 'female';
	/** Canonical ids of this character's parents (must also appear in the data). */
	parents?: string[];
	/** Canonical ids of this character's spouses/consorts (reciprocal is derived). */
	spouses?: string[];
}
const FAMILY: FamilyDef[] = [
	// ── Founding couples ──
	{ id: 'viserys-i-targaryen', gender: 'male', spouses: ['aemma-arryn', 'alicent-hightower'] },
	{ id: 'aemma-arryn', gender: 'female' },
	{ id: 'alicent-hightower', gender: 'female', parents: ['otto-hightower'] },
	{ id: 'otto-hightower', gender: 'male' },
	{ id: 'daemon-targaryen', gender: 'male', spouses: ['rhea-royce', 'laena-velaryon', 'rhaenyra-targaryen'] },
	{ id: 'rhea-royce', gender: 'female' },
	{ id: 'corlys-velaryon', gender: 'male', spouses: ['rhaenys-targaryen'] },
	{ id: 'rhaenys-targaryen', gender: 'female' },
	// ── Their children ──
	{ id: 'rhaenyra-targaryen', gender: 'female', parents: ['viserys-i-targaryen', 'aemma-arryn'], spouses: ['laenor-velaryon'] },
	{ id: 'aegon-ii-targaryen', gender: 'male', parents: ['viserys-i-targaryen', 'alicent-hightower'], spouses: ['helaena-targaryen'] },
	{ id: 'helaena-targaryen', gender: 'female', parents: ['viserys-i-targaryen', 'alicent-hightower'] },
	{ id: 'aemond-targaryen', gender: 'male', parents: ['viserys-i-targaryen', 'alicent-hightower'] },
	{ id: 'laenor-velaryon', gender: 'male', parents: ['corlys-velaryon', 'rhaenys-targaryen'] },
	{ id: 'laena-velaryon', gender: 'female', parents: ['corlys-velaryon', 'rhaenys-targaryen'] },
	{ id: 'addam-of-hull', gender: 'male', parents: ['corlys-velaryon'] },
	{ id: 'alyn-of-hull', gender: 'male', parents: ['corlys-velaryon'] },
	// ── Grandchildren ──
	{ id: 'jacaerys-velaryon', gender: 'male', parents: ['rhaenyra-targaryen', 'laenor-velaryon'] },
	{ id: 'lucerys-velaryon', gender: 'male', parents: ['rhaenyra-targaryen', 'laenor-velaryon'] },
	{ id: 'joffrey-velaryon', gender: 'male', parents: ['rhaenyra-targaryen', 'laenor-velaryon'] },
	{ id: 'baela-targaryen', gender: 'female', parents: ['daemon-targaryen', 'laena-velaryon'] },
	{ id: 'rhaena-targaryen', gender: 'female', parents: ['daemon-targaryen', 'laena-velaryon'] },
	{ id: 'jaehaerys-targaryen', gender: 'male', parents: ['aegon-ii-targaryen', 'helaena-targaryen'] }
];

/**
 * Attach the FAMILY relationships to the seeded characters. Only touches
 * characters that exist in the project and only records edges whose endpoints
 * are also present, so a dataset missing some people still yields a valid tree.
 */
function addFamily(project: Project): void {
	for (const f of FAMILY) {
		const character = project.characters[f.id as CharacterId];
		if (!character) continue;
		character.gender = f.gender;
		const parents = (f.parents ?? []).filter((p) => project.characters[p as CharacterId]);
		if (parents.length) character.parentIds = parents as CharacterId[];
		const spouses = (f.spouses ?? []).filter((s) => project.characters[s as CharacterId]);
		if (spouses.length) character.spouseIds = spouses as CharacterId[];
	}
}

/**
 * Portrait + short bullet-point facts for the /tree profile modal, sourced
 * from the German Game of Thrones Fandom wiki (gameofthrones.fandom.com/de).
 * Only the FAMILY core is covered. Facts are German-only (no English wiki
 * pass was done) — an English-locale project simply shows no facts, falling
 * back to the modal's placeholder text; the portrait itself is locale-independent.
 */
interface CharacterProfileDef {
	id: string;
	image?: string;
	facts: string[];
}
const CHARACTER_PROFILES: CharacterProfileDef[] = [
	{
		id: 'viserys-i-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/b/b0/102_Viserys.jpg/revision/latest?cb=20220830192415&path-prefix=de',
		facts: [
			'Fünfter Targaryen-König, genannt „der Friedvolle“',
			'Vater von Rhaenyra, Aegon II., Aemond und Helaena',
			'Erst mit Aemma Arryn, dann mit Alicent Hohenturm verheiratet',
			'Starb an einer unbekannten Krankheit'
		]
	},
	{
		id: 'aemma-arryn',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/4/42/101_Aemma.jpg/revision/latest?cb=20220830164135&path-prefix=de',
		facts: [
			'Königin aus Haus Arryn, erste Gemahlin von Viserys I.',
			'Mutter von Rhaenyra Targaryen',
			'Starb bei einem Kaiserschnitt an Blutverlust',
			'Sohn Baelon überlebte die Geburt nur einen Tag'
		]
	},
	{
		id: 'alicent-hightower',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/7/72/Teaser_Alicent_alt.png/revision/latest?cb=20220830163821&path-prefix=de',
		facts: [
			'Königin aus Haus Hohenturm, zweite Gemahlin von Viserys I.',
			'Tochter der Hand des Königs, Otto Hohenturm',
			'Mutter von Aegon II., Helaena, Aemond und Daeron',
			'Anführerin der Grünen im Tanz der Drachen'
		]
	},
	{
		id: 'otto-hightower',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/6/6c/102_Otto.jpg/revision/latest?cb=20220830174253&path-prefix=de',
		facts: [
			'Hand des Königs unter Jaehaerys I., Viserys I. und Aegon II.',
			'Vater von Alicent Hohenturm',
			'Strippenzieher der Grünen Fraktion',
			'Von Rhaenyra Targaryen enthauptet'
		]
	},
	{
		id: 'daemon-targaryen',
		image: 'https://static.wikia.nocookie.net/gameofthrones/images/d/d5/Daemon_S3_Profile.png/revision/latest?cb=20260702220100',
		facts: [
			'Prinz, jüngerer Bruder von König Viserys I.',
			'Reiter des Drachen Caraxes, führt die Klinge Dunkle Schwester',
			'Später Ehemann seiner Nichte Rhaenyra Targaryen',
			'Bedeutender Anführer der Schwarzen im Tanz der Drachen'
		]
	},
	{
		id: 'rhea-royce',
		// No real portrait on the wiki — only a generic placeholder shared across
		// unillustrated characters, so left unset rather than showing a non-portrait.
		facts: [
			'Erbin von Runenstein aus Haus Rois (Royce)',
			'Erste, entfremdete Gemahlin von Daemon Targaryen',
			'Ehe blieb kinderlos',
			'Starb 116 n. A. E. an den Folgen eines Jagdunfalls'
		]
	},
	{
		id: 'corlys-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/5/5a/Corlys_Velaryon_S2.jpg/revision/latest?cb=20240606091353',
		facts: [
			'Lord der Gezeiten, Oberhaupt des Hauses Velaryon, „die Seeschlange“',
			'Berühmter Seefahrer mit der größten Flotte von Westeros',
			'Ehemann von Prinzessin Rhaenys Targaryen',
			'Vater von Laenor und Laena Velaryon'
		]
	},
	{
		id: 'rhaenys-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/7/79/102_Rhaenys.jpg/revision/latest?cb=20220830193505&path-prefix=de',
		facts: [
			'Genannt „die Königin, die niemals war“',
			'Reiterin des Drachen Meleys',
			'Gemahlin von Corlys Velaryon, Cousine von Viserys I.',
			'Fiel mit Meleys in der Schlacht von Krähenruh'
		]
	},
	{
		id: 'rhaenyra-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/9/97/Rhaenyra-110-Portrait.jpg/revision/latest?cb=20231212095855',
		facts: [
			'Von Viserys I. zur Thronerbin ernannt',
			'Reiterin des Drachen Syrax',
			'Tochter von Viserys I. und Aemma Arryn',
			'Ihr Thronanspruch löste den Tanz der Drachen aus'
		]
	},
	{
		id: 'aegon-ii-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/3/3f/S2_Aegon_II_Targaryen_Infobox.jpg/revision/latest?cb=20240624172214',
		facts: [
			'Sechster König aus dem Haus Targaryen',
			'Ältester Sohn von Viserys I. und Alicent Hohenturm',
			'Reiter des Drachen Sonnenfeuer',
			'Thronbesteigung löste den Tanz der Drachen aus'
		]
	},
	{
		id: 'helaena-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/c/cf/301_Helaena_Targaryen.png/revision/latest?cb=20260626190349&path-prefix=de',
		facts: [
			'Prinzessin und spätere Königin aus Haus Targaryen',
			'Tochter von Viserys I. und Alicent Hohenturm',
			'Schwester und Gemahlin von Aegon II.',
			'Reiterin des Drachen Traumfeuer'
		]
	},
	{
		id: 'aemond-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/f/f0/Aemond_Targaryen_Official_Guide_2.jpg/revision/latest?cb=20221010040524',
		facts: [
			'Genannt „Aemond Einauge“, zweiter Sohn von Viserys I. und Alicent',
			'Beansprucht den Drachen Vhagar für sich',
			'Verlor ein Auge im Streit mit Rhaenyras Söhnen',
			'Wird Prinzregent der Grünen nach Aegons Verwundung'
		]
	},
	{
		id: 'laenor-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/5/50/Laenor_Velaryon_Official_Guide_3.jpg/revision/latest?cb=20220926034629',
		facts: [
			'Sohn von Corlys Velaryon und Rhaenys Targaryen',
			'Reiter des Drachen Seerauch',
			'Erster Ehemann von Rhaenyra Targaryen',
			'Kämpfte im Krieg um die Trittsteine'
		]
	},
	{
		id: 'laena-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/a/ab/Laena_Velaryon_Official_Guide_3.jpg/revision/latest?cb=20220926034616',
		facts: [
			'Tochter von Corlys Velaryon und Rhaenys Targaryen',
			'Zweite Gemahlin von Daemon Targaryen',
			'Reiterin des Drachen Vhagar',
			'Ließ sich bei Geburtskomplikationen von Vhagar verbrennen'
		]
	},
	{
		id: 'addam-of-hull',
		image: 'https://static.wikia.nocookie.net/gameofthrones/images/c/c8/Addam-portrait.png/revision/latest?cb=20240625103939',
		facts: [
			'Schiffsbauer für die Velaryon-Flotte aus Holk (Hull)',
			'Gerüchteweise unehelicher Sohn von Laenor Velaryon',
			'Als Drachensaat Reiter des Drachen Seerauch',
			'Später als Addam Velaryon legitimiert'
		]
	},
	{
		id: 'alyn-of-hull',
		image: 'https://static.wikia.nocookie.net/gameofthrones/images/3/33/Alyn_of_Hull.png/revision/latest?cb=20240605031249',
		facts: [
			'Seemann in Diensten des Hauses Velaryon aus Holk (Hull)',
			'Kämpfte im Krieg um die Trittsteine',
			'Rettete Lord Corlys Velaryon das Leben',
			'Bruder von Addam aus Holk'
		]
	},
	{
		id: 'jacaerys-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/0/0d/JacaerysVelaryonOlderInfobox.PNG/revision/latest?cb=20221006133736',
		facts: [
			'Ältester Sohn von Rhaenyra Targaryen und Laenor Velaryon',
			'Reiter des Drachen Vermax',
			'Zweiter in der Thronfolge nach Rhaenyra',
			'Genetisch vermutlich Sohn von Harwin Kraft, nicht Laenor'
		]
	},
	{
		id: 'lucerys-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/3/32/Lucerys_Velaryon_Official_Guide_2.jpg/revision/latest?cb=20221010040909',
		facts: [
			'Zweiter Sohn von Rhaenyra Targaryen und Laenor Velaryon',
			'Erbe von Driftmark, Reiter des Drachen Arrax',
			'Von Vhagar über Sturmkap in Stücke gerissen',
			'Sein Tod löste den offenen Krieg des Tanzes der Drachen aus'
		]
	},
	{
		id: 'joffrey-velaryon',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/4/45/Joffrey_Velaryon_Official_Guide.jpg/revision/latest?cb=20221010040846',
		facts: [
			'Im deutschen Wiki als „Gottfrid Velaryon“ geführt',
			'Dritter Sohn von Rhaenyra Targaryen und Laenor Velaryon',
			'Reiter des Drachen Tyraxes',
			'Wächst auf Drachenstein auf'
		]
	},
	{
		id: 'baela-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/3/39/Baela_Targaryen_Official_Guide_2.jpg/revision/latest?cb=20221010040554',
		facts: [
			'Älteste Tochter von Daemon Targaryen und Laena Velaryon',
			'Reiterin des Drachen Mondtänzerin',
			'Ältere Schwester von Rhaena Targaryen',
			'Kämpft auf Seiten der Schwarzen'
		]
	},
	{
		id: 'rhaena-targaryen',
		image:
			'https://static.wikia.nocookie.net/gameofthrones/images/d/d0/Rhaena_Targaryen_Official_Guide_2.jpg/revision/latest?cb=20221010040922',
		facts: [
			'Jüngste Tochter von Daemon Targaryen und Laena Velaryon',
			'Ihr Drachenei schlüpfte nie, lange ohne eigenen Drachen',
			'Jüngere Schwester von Baela Targaryen',
			'Kämpft auf Seiten der Schwarzen'
		]
	},
	{
		id: 'jaehaerys-targaryen',
		image: 'https://static.wikia.nocookie.net/gameofthrones/images/c/ce/Jaehaerys_Targaryen_S2.png/revision/latest?cb=20240617081002',
		facts: [
			'Ältester Sohn von Aegon II. und Helaena Targaryen',
			'Zwillingsbruder von Jaehaera Targaryen',
			'Von den Attentätern Blut und Käse enthauptet',
			'Sein Tod entfacht Rachemorde im Tanz der Drachen'
		]
	}
];

/** Attach CHARACTER_PROFILES (portrait + facts) to the seeded characters. */
function addCharacterProfiles(project: Project): void {
	for (const p of CHARACTER_PROFILES) {
		const character = project.characters[p.id as CharacterId];
		if (!character) continue;
		if (p.image) character.image = p.image;
		character.facts = p.facts;
	}
}

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
			sizeScale: d.sizeScale,
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
 * allegiance switch (see model.AllegianceChange) so the map recolours
 * as the timeline crosses the coronation. Characters the dataset already marks
 * Neutral (and those with no faction) are left untouched.
 */
/**
 * Location coordinates, keyed by (locale-independent) location id, exported from
 * the /editor map tool and checked into the repo — see
 * data/hotd/location-coordinates.json. This is the *exclusive* source of truth
 * for where a place sits on the current base map: every location is first reset
 * to unplaced, then only the ids this file knows about are placed. Some episode
 * source JSON still carries coordinates from a since-retired base map; without
 * this reset those stale values would render as if already placed and never
 * show up as "unplaced" in /editor.
 */
const LOCATION_COORDINATES = locationCoordinatesJson as Record<string, { x: number; y: number }>;

function applyLocationCoordinates(project: Project): void {
	for (const loc of Object.values(project.locations)) {
		loc.coordinates = { x: null, y: null };
	}
	for (const [id, coords] of Object.entries(LOCATION_COORDINATES)) {
		const loc = project.locations[id as LocationId];
		if (loc) loc.coordinates = { x: coords.x, y: coords.y };
	}
}

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
	// the dataset live in this image's 848×1264 space, so markers land in place.
	project.map = { imageUrl: '/westeros_dark_ger.png', width: 848, height: 1264 };
	const modules = episodeModules[locale];
	for (const path of Object.keys(modules).sort()) {
		const result = extractionContract.parse(modules[path]);
		mergeExtractionInto(project, result, { orderOffset: nextOrderOffset(project) });
	}
	addDragons(project, locale);
	addFamily(project);
	addCharacterProfiles(project);
	applyDeathDetails(project, locale);
	applyCoronationSplit(project);
	applyLocationCoordinates(project);
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
