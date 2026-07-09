<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { SvelteSet } from 'svelte/reactivity';
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { characterWaypoints } from '$lib/core/playback';
	import { characterDeaths, episodeKeyOf, factionAt } from '$lib/core/derive';
	import { episodeRange } from '$lib/core/episode-filter.svelte';
	import type { Character, Project } from '$lib/core/model';
	import { t } from '$lib/i18n/i18n.svelte';
	import { factionColor } from '$lib/ui/faction-color';
	import { buildLocationMarkers, buildMovementLines } from '$lib/map3d/location-view';
	import { buildCharacterClusters, type ClusterFilters } from '$lib/map3d/character-clusters';
	import { buildDeathTrails, buildDeathBadges } from '$lib/map3d/death-view';
	import MapScene from '$lib/map3d/MapScene.svelte';
	import PlayerControls from '$lib/ui/PlayerControls.svelte';
	import SceneTimeline from '$lib/ui/SceneTimeline.svelte';

	// Read-only viewer: locations/base map are authored in /editor. This page
	// never mutates coordinates.

	// Map label overlays: toggle always-on names for locations and characters.
	let showLocationNames = $state(true);
	let showCharacterNames = $state(false);
	// Visibility of person categories on the map.
	let showStationary = $state(true);
	let showDead = $state(true);
	// Travel lines between locations are visual clutter at a glance; off by default.
	let showMovementLines = $state(false);
	// Who to map: everyone, only people, or only dragons. Dragons are characters
	// flagged kind:'dragon' (they ride along with their rider), so this mode scopes
	// every people/dragon overlay — markers, movement lines and deaths alike.
	let personMode = $state<'all' | 'people' | 'dragons' | 'dragonRiders'>('all');
	const isDragon = (id: string) =>
		store.project.characters[id as keyof typeof store.project.characters]?.kind === 'dragon';
	// Every character who rides a dragon (union of all dragons' riderIds) — drives
	// the "dragons + riders" view.
	const riderIds = $derived(
		new Set(Object.values(store.project.characters).flatMap((c) => (c.riderIds ?? []) as string[]))
	);

	function kindAllowed(id: string): boolean {
		if (personMode === 'people') return !isDragon(id);
		if (personMode === 'dragons') return isDragon(id);
		if (personMode === 'dragonRiders') return isDragon(id) || riderIds.has(id);
		return true;
	}

	// Hidden factions / houses (a member is hidden when its group is unchecked).
	const hiddenFactions = new SvelteSet<string>();
	const hiddenHouses = new SvelteSet<string>();

	function toggleSet(set: SvelteSet<string>, v: string): void {
		if (set.has(v)) set.delete(v);
		else set.add(v);
	}

	// House fallback when a character has no explicit `house`: the surname — the
	// trailing "of X", else the last name token (single-name characters like
	// "Mysaria" have no house).
	function houseOf(name: string): string {
		const of = name.match(/\bof\s+(.+)$/i);
		if (of) return of[1].trim();
		const parts = name.trim().split(/\s+/);
		return parts.length > 1 ? parts[parts.length - 1] : '';
	}

	const houseFor = (c: Character) => c.house ?? houseOf(c.name);
	// All party values that ever appear — base factions plus any reached via an
	// allegiance switch — so the filter lists every side, not just the current ones.
	const factionsList = $derived(
		[
			...new Set(
				Object.values(store.project.characters)
					.flatMap((c) => [c.faction, ...(c.allegiances?.map((a) => a.faction) ?? [])])
					.filter((f): f is string => !!f)
			)
		].sort()
	);
	const housesList = $derived(
		[...new Set(Object.values(store.project.characters).map(houseFor).filter(Boolean))].sort()
	);

	// ── Filters ───────────────────────────────────────────────────────────────
	// Episode range is shared with the Timeline via the episodeRange singleton.
	// The per-character show/hide below is Map-only.
	const hidden = new SvelteSet<string>(); // hidden character ids
	const isVisible = (id: string) => !hidden.has(id);

	function toggleChar(id: string): void {
		if (hidden.has(id)) hidden.delete(id);
		else hidden.add(id);
	}

	function showAllChars(): void {
		for (const c of viewCharacters) hidden.delete(c.id);
	}

	function hideAllChars(): void {
		for (const c of viewCharacters) hidden.add(c.id);
	}

	const episodes = $derived(store.episodeGroups);
	const keys = $derived(episodes.map((e) => e.key));
	const bounds = $derived(episodeRange.bounds(keys));
	const lo = $derived(bounds.lo);
	const hi = $derived(bounds.hi);
	const selectedKeys = $derived(episodeRange.selectedKeys(keys));
	const isFullRange = $derived(episodeRange.isFull(keys));

	function setFrom(key: string): void {
		episodeRange.setFrom(key, episodes);
	}

	function setTo(key: string): void {
		episodeRange.setTo(key, episodes);
	}

	function showAllEpisodes(): void {
		episodeRange.reset();
	}

	function episodeView(project: Project, sel: Set<string>, full: boolean): Project {
		if (full) return project;
		const scenes = Object.fromEntries(
			Object.entries(project.scenes).filter(([, s]) => sel.has(episodeKeyOf(s)))
		);
		const events = Object.fromEntries(
			Object.entries(project.events).filter(([, e]) => sel.has(episodeKeyOf(e)))
		);
		return { ...project, scenes, events } as Project;
	}

	// Project view scoped to the selected episode range (drives every map overlay).
	const view = $derived(episodeView(store.project, selectedKeys, isFullRange));
	// Characters present in the current view — the rows of the character filter.
	const viewCharacters = $derived.by(() => {
		const ids = new Set<string>();
		for (const s of Object.values(view.scenes)) for (const c of s.characters) ids.add(c as string);
		for (const e of Object.values(view.events))
			for (const c of e.charactersInvolved) ids.add(c as string);
		return [...ids]
			.map((id) => store.project.characters[id as keyof typeof store.project.characters])
			.filter((c) => !!c && kindAllowed(c.id as string))
			.sort((a, b) => a.name.localeCompare(b.name));
	});
	// While a range is selected, only its locations stay on the map (null = all).
	const episodeLocationIds = $derived.by(() => {
		if (isFullRange) return null;
		const ids = new Set<string>();
		for (const s of Object.values(view.scenes)) if (s.locationId) ids.add(s.locationId as string);
		for (const e of Object.values(view.events)) if (e.locationId) ids.add(e.locationId as string);
		return ids;
	});

	// ── Map3D view models ────────────────────────────────────────────────────
	// Pure builder functions (src/lib/map3d) turn the current filter state +
	// clock position into plain render data for the Threlte scene.
	const clusterFilters = $derived<ClusterFilters>({
		isVisible,
		kindAllowed,
		hiddenFactions,
		hiddenHouses,
		houseFor,
		showStationary,
		showDead
	});
	const clusterLabels = $derived({
		travelers: t('map.travelers'),
		stationary: t('map.stationary'),
		dead: t('map.dead')
	});
	const viewDeaths = $derived(characterDeaths(view));
	const viewWaypoints = $derived(characterWaypoints(view));

	const locationMarkers = $derived(buildLocationMarkers(store.project, episodeLocationIds));
	const movementLines = $derived(buildMovementLines(view, store.project, isVisible, kindAllowed));
	const characterClusters = $derived(
		buildCharacterClusters(
			view,
			store.project,
			clock.current,
			viewDeaths,
			clusterFilters,
			clusterLabels
		)
	);
	const deathTrails = $derived(
		buildDeathTrails(
			store.project,
			clock.current,
			viewDeaths,
			viewWaypoints,
			isVisible,
			kindAllowed
		)
	);
	const deathBadges = $derived(
		buildDeathBadges(store.project, clock.current, viewDeaths, isVisible, kindAllowed, t('death.by'))
	);

	const currentIndex = $derived(Math.round(clock.current));

	function epLabel(ev?: { season?: number | null; episode?: number | null }): string {
		if (!ev || ev.season == null || ev.episode == null) return '';
		const p = (n: number) => String(n).padStart(2, '0');
		return `S${p(ev.season)}E${p(ev.episode)}`;
	}

	// Flat, ordered list of deaths for the overview panel beside the map.
	const deaths = $derived(
		[...characterDeaths(view).values()]
			.filter((d) => isVisible(d.characterId) && kindAllowed(d.characterId as string))
			.sort((a, b) => a.orderIndex - b.orderIndex)
			.map((d) => ({
				characterId: d.characterId,
				orderIndex: d.orderIndex,
				name: store.project.characters[d.characterId]?.name ?? (d.characterId as string),
				place: d.locationId
					? (store.project.locations[d.locationId]?.name ?? (d.locationId as string))
					: '—',
				ep: epLabel(store.project.events[d.eventId]),
				killer: d.killerId ? (store.project.characters[d.killerId]?.name ?? null) : null,
				cause: d.cause ?? null,
				weapon: d.weapon ?? null
			}))
	);
</script>

<h1>{t('nav.mapTimeline')}</h1>
<PlayerControls />

<div class="map-wrap">
	<div class="map">
		{#if store.project.map}
			<Canvas>
				<MapScene
					mapConfig={store.project.map}
					{locationMarkers}
					movementLines={showMovementLines ? movementLines : []}
					{characterClusters}
					{deathTrails}
					{deathBadges}
					{showLocationNames}
					{showCharacterNames}
				/>
			</Canvas>
		{/if}
	</div>
	<div class="map-overlay">
		<div class="ov-sec">
			<span class="ov-title sa-muted">{t('map.labels')}</span>
			<label
			><input type="checkbox" bind:checked={showLocationNames} />{t('map.locationNames')}</label
			>
			<label
			><input type="checkbox" bind:checked={showCharacterNames} />{t('map.characterNames')}</label
			>
		</div>
		<div class="ov-sec">
			<span class="ov-title sa-muted">{t('map.show')}</span>
			<label><input type="checkbox" bind:checked={showStationary} />{t('map.stationary')}</label>
			<label><input type="checkbox" bind:checked={showDead} />{t('map.dead')}</label>
			<label
			><input type="checkbox" bind:checked={showMovementLines} />{t('map.movementLines')}</label
			>
		</div>
		<div class="ov-sec">
			<span class="ov-title sa-muted">{t('map.who')}</span>
			<label><input type="radio" name="kind" value="all" bind:group={personMode} />{t('map.everyone')}</label>
			<label
			><input type="radio" name="kind" value="people" bind:group={personMode} />{t('map.people')}</label
			>
			<label
			><input type="radio" name="kind" value="dragons" bind:group={personMode} />{t('map.dragons')}</label
			>
			<label
			><input type="radio" name="kind" value="dragonRiders" bind:group={personMode} />{t(
				'map.dragonRiders'
			)}</label
			>
		</div>
		{#if factionsList.length}
			<div class="ov-sec">
				<span class="ov-title sa-muted">{t('map.factions')}</span>
				{#each factionsList as f (f)}
					<label
					><input
						type="checkbox"
						checked={!hiddenFactions.has(f)}
						onchange={() => toggleSet(hiddenFactions, f)}
					/>{f}</label
					>
				{/each}
			</div>
		{/if}
		{#if housesList.length}
			<div class="ov-sec houses">
				<span class="ov-title sa-muted">{t('map.houses')}</span>
				{#each housesList as ho (ho)}
					<label
					><input
						type="checkbox"
						checked={!hiddenHouses.has(ho)}
						onchange={() => toggleSet(hiddenHouses, ho)}
					/>{ho}</label
					>
				{/each}
			</div>
		{/if}
	</div>
</div>

<div class="panels">
	<aside class="sa-card filters">
		<h3>{t('map.filter')}</h3>
		{#if episodes.length > 1}
			<div class="ep-range">
				<label>
					<span>{t('timeline.from')}</span>
					<select value={keys[lo]} onchange={(e) => setFrom(e.currentTarget.value)}>
						{#each episodes as ep (ep.key)}
							<option value={ep.key}>{ep.label}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>{t('timeline.to')}</span>
					<select value={keys[hi]} onchange={(e) => setTo(e.currentTarget.value)}>
						{#each episodes as ep (ep.key)}
							<option value={ep.key}>{ep.label}</option>
						{/each}
					</select>
				</label>
				{#if !isFullRange}
					<button class="clear" onclick={showAllEpisodes}>{t('timeline.showAll')}</button>
				{/if}
			</div>
		{/if}
		<div class="char-head">
			<span class="sa-muted">{t('map.characters')} ({viewCharacters.length})</span>
			<span class="bulk">
				<button onclick={showAllChars}>{t('map.all')}</button>
				<button onclick={hideAllChars}>{t('map.none')}</button>
			</span>
		</div>
		<div class="char-list">
			{#each viewCharacters as c (c.id)}
				<label class="chip">
					<input
						type="checkbox"
						checked={!hidden.has(c.id)}
						onchange={() => toggleChar(c.id)}
					/><span style:color={factionColor(factionAt(c, clock.current))}>{c.name}</span>
				</label>
			{/each}
		</div>
	</aside>

	<aside class="sa-card deaths-panel">
		<h3>💀 {t('map.deaths')} ({deaths.length})</h3>
		{#if deaths.length}
			<ol class="death-list">
				{#each deaths as d (d.characterId)}
					<li class:occurred={currentIndex >= d.orderIndex}>
						<button
							class="seek"
							onclick={() => clock.seek(d.orderIndex)}
							title={t('timeline.jumpHere')}>#{d.orderIndex}</button
						>
						<span class="who">{d.name}</span>
						<span class="at sa-muted">@ {d.place}{d.ep ? ` · ${d.ep}` : ''}</span>
						{#if d.killer || d.cause || d.weapon}
							<span class="detail sa-muted">
								{#if d.killer}<span class="killer">† {t('death.by')} {d.killer}</span>{/if}
								{#if d.cause}<span class="cause">{d.cause}</span>{/if}
								{#if d.weapon}<span class="weapon">⚔ {d.weapon}</span>{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="sa-muted">—</p>
		{/if}
	</aside>

	<section class="sa-card timeline-panel">
		<h3>🗓️ {t('timeline.title')}</h3>
		<SceneTimeline />
	</section>
</div>

<style>
    .map-wrap {
        position: relative;
        margin-bottom: 1rem;
        border: 1px solid var(--sa-border);
        border-radius: var(--sa-radius);
        overflow: hidden;
    }

    .map {
        height: 62vh;
        background: #0c0c12;
    }

    .map-overlay {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        max-height: calc(62vh - 1rem);
        overflow-y: auto;
        padding: 0.5rem 0.6rem;
        background: color-mix(in srgb, var(--sa-surface) 90%, transparent);
        border: 1px solid var(--sa-border);
        border-radius: var(--sa-radius);
        box-shadow: var(--sa-shadow);
        font-size: 0.8rem;
    }

    .ov-sec {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .map-overlay .ov-title {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .map-overlay label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        cursor: pointer;
    }

    .map-overlay input {
        width: auto;
    }

    @media (max-width: 640px) {
        .map-overlay {
            position: static;
            top: auto;
            right: auto;
            width: 100%;
            max-height: none;
            flex-direction: row;
            flex-wrap: wrap;
            margin-top: 0.5rem;
        }

        .map-overlay .ov-sec {
            flex: 1 1 45%;
            min-width: 140px;
        }

        .map-overlay label {
            width: 100%;
        }

        .map-overlay .ov-sec.houses {
            flex-basis: 100%;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.15rem 1rem;
        }

        .map-overlay .ov-sec.houses .ov-title {
            grid-column: 1 / -1;
        }
    }

    .panels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
    }

    .panels .timeline-panel {
        grid-column: 1 / -1;
    }

    @media (max-width: 720px) {
        .panels {
            grid-template-columns: 1fr;
        }
    }

    .deaths-panel h3 {
        margin-bottom: 0.5rem;
    }

    .death-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        max-height: 46vh;
        overflow-y: auto;
    }

    .death-list li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.2rem 0.4rem;
        padding: 0.25rem 0;
        font-size: 0.85rem;
        opacity: 0.45;
        border-bottom: 1px solid var(--sa-border);
    }

    .death-list li.occurred {
        opacity: 1;
    }

    .death-list .detail {
        flex-basis: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: 0.15rem 0.6rem;
        font-size: 0.74rem;
        line-height: 1.35;
    }

    .death-list .detail .killer {
        color: var(--sa-danger);
    }

    .death-list .detail .weapon {
        white-space: nowrap;
    }

    .death-list .seek {
        font-variant-numeric: tabular-nums;
        padding: 0.1rem 0.35rem;
        font-size: 0.78rem;
    }

    .death-list .who {
        font-weight: 500;
    }

    .death-list .at {
        margin-left: auto;
        font-size: 0.78rem;
        white-space: nowrap;
    }

    .ep-range {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.7rem;
    }

    .ep-range label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--sa-text-dim);
    }

    .ep-range select {
        width: auto;
        font-variant-numeric: tabular-nums;
    }

    .ep-range .clear {
        align-self: flex-start;
        font-size: 0.8rem;
        padding: 0.15rem 0.5rem;
    }

    .char-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.3rem;
        font-size: 0.8rem;
    }

    .char-head .bulk {
        display: flex;
        gap: 0.3rem;
    }

    .char-head .bulk button {
        font-size: 0.75rem;
        padding: 0.15rem 0.45rem;
    }

    .char-list {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        max-height: 38vh;
        overflow-y: auto;
    }

    .char-list .chip {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        cursor: pointer;
    }

    .char-list .chip input {
        width: auto;
    }
</style>
