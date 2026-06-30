<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type * as LeafletTypes from 'leaflet';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { characterPlacementsAt, characterWaypoints } from '$lib/core/playback';
	import { movementEdges, characterDeaths, episodeKeyOf, factionAt } from '$lib/core/derive';
	import { episodeRange } from '$lib/core/episode-filter.svelte';
	import type { Project } from '$lib/core/model';
	import type { LocationId } from '$lib/core/ids';
	import { t } from '$lib/i18n/i18n.svelte';
	import { EDIT_MODE } from '$lib/core/env';
	import { factionColor } from '$lib/ui/faction-color';
	import PlayerControls from '$lib/ui/PlayerControls.svelte';
	import SceneTimeline from '$lib/ui/SceneTimeline.svelte';
	import DragBoard from '$lib/ui/DragBoard.svelte';

	let mapEl: HTMLDivElement;
	let L: typeof import('leaflet') | null = null;
	let map: LeafletTypes.Map | null = null;
	let overlay: LeafletTypes.ImageOverlay | null = null;
	let locationLayer: LeafletTypes.LayerGroup | null = null;
	let movementLayer: LeafletTypes.LayerGroup | null = null;
	let characterLayer: LeafletTypes.LayerGroup | null = null;
	let deathLayer: LeafletTypes.LayerGroup | null = null;
	let ready = $state(false);
	let placingId = $state<LocationId | null>(null);

	// Map label overlays: toggle always-on names for locations and characters.
	let showLocationNames = $state(true);
	let showCharacterNames = $state(false);
	// Visibility of person categories on the map.
	let showStationary = $state(true);
	let showDead = $state(true);
	// Who to map: everyone, only people, or only dragons. Dragons are characters
	// flagged kind:'dragon' (they ride along with their rider), so this mode scopes
	// every people/dragon overlay — markers, movement lines and deaths alike.
	let personMode = $state<'all' | 'people' | 'dragons'>('all');
	const isDragon = (id: string) =>
		store.project.characters[id as keyof typeof store.project.characters]?.kind === 'dragon';
	function kindAllowed(id: string): boolean {
		if (personMode === 'people') return !isDragon(id);
		if (personMode === 'dragons') return isDragon(id);
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
	const houseFor = (c: { name: string; house?: string | null }) => c.house ?? houseOf(c.name);
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

	// Map config form
	let imageUrl = $state('');
	let width = $state(1000);
	let height = $state(1000);

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

	// pixel (x,y) with top-left origin <-> Leaflet CRS.Simple latLng
	const toLatLng = (x: number, y: number, h: number): [number, number] => [h - y, x];

	// Names are project data; escape before injecting into Leaflet tooltip HTML.
	function escapeHtml(s: string): string {
		return s.replace(/[&<>"]/g, (c) =>
			c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
		);
	}

	onMount(() => {
		let destroyed = false;
		void (async () => {
			const lib = await import('leaflet');
			if (destroyed) return;
			L = lib;
			map = lib.map(mapEl, {
				crs: lib.CRS.Simple,
				minZoom: -6,
				maxZoom: 6,
				attributionControl: false
			});
			locationLayer = lib.layerGroup().addTo(map);
			movementLayer = lib.layerGroup().addTo(map);
			deathLayer = lib.layerGroup().addTo(map);
			characterLayer = lib.layerGroup().addTo(map);
			map.on('click', (ev: LeafletTypes.LeafletMouseEvent) => {
				const cfg = store.project.map;
				if (!placingId || !cfg) return;
				const loc = store.project.locations[placingId];
				if (loc) {
					loc.coordinates.x = Math.round(ev.latlng.lng);
					loc.coordinates.y = Math.round(cfg.height - ev.latlng.lat);
				}
				placingId = null;
			});
			ready = true;
		})();
		return () => {
			destroyed = true;
			map?.remove();
			map = null;
		};
	});

	// (Re)build the base image overlay when the map config changes.
	$effect(() => {
		const cfg = store.project.map;
		if (!ready || !L || !map) return;
		overlay?.remove();
		overlay = null;
		if (!cfg) return;
		const bounds: LeafletTypes.LatLngBoundsLiteral = [
			[0, 0],
			[cfg.height, cfg.width]
		];
		overlay = L.imageOverlay(cfg.imageUrl, bounds).addTo(map);
		map.fitBounds(bounds);
	});

	// Location markers (draggable) + movement paths — scoped by the active filters.
	$effect(() => {
		if (!ready || !L || !map || !locationLayer || !movementLayer) return;
		const cfg = store.project.map;
		const locations = Object.values(store.project.locations);
		const locFilter = episodeLocationIds;
		const edges = movementEdges(view).filter(
			(e) => isVisible(e.characterId) && kindAllowed(e.characterId as string)
		);
		locationLayer.clearLayers();
		movementLayer.clearLayers();
		if (!cfg) return;
		const h = cfg.height;
		const icon = L.divIcon({ className: 'sa-loc-dot', html: '', iconSize: [14, 14] });

		for (const loc of locations) {
			if (loc.coordinates.x == null || loc.coordinates.y == null) continue;
			if (locFilter && !locFilter.has(loc.id)) continue;
			const marker = L.marker(toLatLng(loc.coordinates.x, loc.coordinates.y, h), {
				draggable: EDIT_MODE,
				icon
			});
			marker.bindTooltip(loc.name, {
				permanent: showLocationNames,
				direction: 'top',
				offset: [0, -8]
			});
			marker.on('dragend', () => {
				const ll = marker.getLatLng();
				loc.coordinates.x = Math.round(ll.lng);
				loc.coordinates.y = Math.round(h - ll.lat);
			});
			marker.addTo(locationLayer);
		}

		for (const edge of edges) {
			const a = store.project.locations[edge.fromLocationId];
			const b = store.project.locations[edge.toLocationId];
			if (!a || !b) continue;
			if (a.coordinates.x == null || a.coordinates.y == null) continue;
			if (b.coordinates.x == null || b.coordinates.y == null) continue;
			L.polyline(
				[
					toLatLng(a.coordinates.x, a.coordinates.y, h),
					toLatLng(b.coordinates.x, b.coordinates.y, h)
				],
				{ color: 'var(--sa-accent)', weight: 1, opacity: 0.35 }
			).addTo(movementLayer);
		}
	});

	// Clock-driven character markers — the dead turn grey and stop moving.
	// Characters sharing a spot are merged into one marker; its tooltip lists them
	// (a count badge when more than one) so names never stack on top of each other.
	$effect(() => {
		if (!ready || !L || !map || !characterLayer) return;
		const cfg = store.project.map;
		const tNow = clock.current;
		const ti = Math.round(tNow);
		const deaths = characterDeaths(view);
		characterLayer.clearLayers();
		if (!cfg) return;
		const h = cfg.height;

		// Group everyone at the same spot (rounded pixel position).
		type Person = { name: string; dead: boolean; moving: boolean; faction: string };
		type Cluster = { x: number; y: number; people: Person[] };
		const clusters = new Map<string, Cluster>();
		for (const p of characterPlacementsAt(view, tNow)) {
			if (!isVisible(p.characterId)) continue;
			if (!kindAllowed(p.characterId as string)) continue;
			const ch = store.project.characters[p.characterId];
			const name = ch?.name ?? (p.characterId as string);
			// Party is resolved at the current timeline position, so allegiance
			// switches change which faction filter a character obeys over time.
			const faction = (ch ? factionAt(ch, tNow) : null) ?? '';
			const house = ch ? houseFor(ch) : houseOf(name);
			if (faction && hiddenFactions.has(faction)) continue;
			if (house && hiddenHouses.has(house)) continue;
			const death = deaths.get(p.characterId);
			const dead = !!death && ti >= death.orderIndex;
			const moving = p.moving && !dead;
			const stationary = !moving && !dead;
			if (dead && !showDead) continue;
			if (stationary && !showStationary) continue;
			const key = `${Math.round(p.x)},${Math.round(p.y)}`;
			const cluster = clusters.get(key) ?? { x: p.x, y: p.y, people: [] };
			cluster.people.push({ name, dead, moving, faction });
			clusters.set(key, cluster);
		}

		for (const c of clusters.values()) {
			// Each name is tinted with its faction colour (resolved at the current
			// time) so allegiance is readable at a glance straight off the map.
			const named = (p: Person, prefix = '') =>
				`<span style="color:${factionColor(p.faction)}">${prefix}${escapeHtml(p.name)}</span>`;
			// Split into the three categories.
			const travelers = c.people.filter((p) => p.moving).map((p) => named(p));
			const stationary = c.people.filter((p) => !p.moving && !p.dead).map((p) => named(p));
			const dead = c.people.filter((p) => p.dead).map((p) => named(p, '† '));

			const sections: string[] = [];
			const onlyOne = [travelers, stationary, dead].filter((g) => g.length).length === 1;
			const section = (label: string, names: string[]) => {
				if (!names.length) return;
				// Heading shown only when more than one category is present.
				sections.push((onlyOne ? '' : `<strong>${label}</strong><br>`) + names.join('<br>'));
			};
			section(t('map.travelers'), travelers);
			section(t('map.stationary'), stationary);
			section(t('map.dead'), dead);
			const list = sections.join('<br>');

			// Marker colour by dominant category: dead > travelling > stationary.
			const allDead = c.people.every((p) => p.dead);
			const anyTravel = c.people.some((p) => p.moving);
			const cls = allDead ? 'dead' : anyTravel ? 'travel' : '';
			const color = allDead ? '#8a8a93' : anyTravel ? '#e0a23a' : '#5aa9e6';
			const latlng = toLatLng(c.x, c.y, h);
			let marker: LeafletTypes.Layer;
			if (c.people.length === 1) {
				marker = L.circleMarker(latlng, {
					radius: 6,
					color,
					fillColor: color,
					fillOpacity: allDead ? 0.6 : 0.9,
					weight: 1
				});
			} else {
				const icon = L.divIcon({
					className: `sa-cluster${cls ? ' ' + cls : ''}`,
					html: String(c.people.length),
					iconSize: [22, 22]
				});
				marker = L.marker(latlng, { icon });
			}
			marker.bindTooltip(list, {
				direction: 'right',
				permanent: showCharacterNames,
				className: 'sa-people-tip'
			});
			marker.addTo(characterLayer);
		}
	});

	// Death paths + place markers: once the clock reaches a death, draw the
	// character's route up to that point as a red dashed trail ending in a skull
	// at the death location.
	$effect(() => {
		if (!ready || !L || !map || !deathLayer) return;
		const cfg = store.project.map;
		const ti = Math.round(clock.current);
		const deaths = characterDeaths(view);
		const wpByChar = characterWaypoints(view);
		deathLayer.clearLayers();
		if (!cfg) return;
		const h = cfg.height;
		for (const death of deaths.values()) {
			if (!isVisible(death.characterId)) continue;
			if (!kindAllowed(death.characterId as string)) continue;
			if (ti < death.orderIndex || !death.locationId) continue;
			const loc = store.project.locations[death.locationId];
			if (!loc || loc.coordinates.x == null || loc.coordinates.y == null) continue;
			const name =
				store.project.characters[death.characterId]?.name ?? (death.characterId as string);
			const end = toLatLng(loc.coordinates.x, loc.coordinates.y, h);

			// Trail: the character's waypoints up to (and including) the death point.
			const wps = (wpByChar.get(death.characterId) ?? []).filter(
				(w) => w.orderIndex <= death.orderIndex
			);
			const pts = wps.map((w) => toLatLng(w.x, w.y, h));
			const last = pts[pts.length - 1];
			if (!last || last[0] !== end[0] || last[1] !== end[1]) pts.push(end);
			if (pts.length >= 2) {
				L.polyline(pts, {
					color: '#d23b3b',
					weight: 2,
					opacity: 0.75,
					dashArray: '5 5'
				}).addTo(deathLayer);
			}

			const icon = L.divIcon({ className: 'sa-death-dot', html: '💀', iconSize: [20, 20] });
			L.marker(end, { icon })
				.bindTooltip('† ' + name, { direction: 'top', offset: [0, -6] })
				.addTo(deathLayer);
		}
	});

	function setMap() {
		if (!imageUrl.trim()) return;
		store.project.map = { imageUrl: imageUrl.trim(), width, height };
	}

	function onUpload(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const url = reader.result as string;
			const img = new Image();
			img.onload = () =>
				(store.project.map = { imageUrl: url, width: img.naturalWidth, height: img.naturalHeight });
			img.src = url;
		};
		reader.readAsDataURL(file);
	}

	const unplaced = $derived(
		Object.values(store.project.locations).filter(
			(l) => l.coordinates.x == null || l.coordinates.y == null
		)
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
				ep: epLabel(store.project.events[d.eventId])
			}))
	);

	// Reorderable panels of the Map & Timeline dashboard (the map stays fixed).
	// The base-map/place-locations panel is authoring-only, so it is shown only
	// when running locally; the published build is a read-only viewer.
	const panels = $derived([
		{ id: 'filter', label: t('map.filter'), rows: 6 },
		...(EDIT_MODE
			? [
					{
						id: 'mapSetup',
						label: store.project.map ? t('map.placeLocations') : t('map.setBaseMap'),
						rows: 4
					}
				]
			: []),
		{ id: 'deaths', label: t('map.deaths'), rows: 4 },
		{ id: 'timeline', label: t('timeline.title'), rows: 7 }
	]);
</script>

<h1>{t('nav.mapTimeline')}</h1>
<PlayerControls />

<div class="map-wrap">
	<div class="map" bind:this={mapEl}></div>
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
			<div class="ov-sec">
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

<DragBoard board="mapTimeline" items={panels}>
	{#snippet widget(id)}
		{#if id === 'filter'}
			<aside class="sa-card filters">
				<h3>{t('map.filter')}</h3>
				{#if episodes.length > 1}
					<div class="ep-range">
						<label>
							<span>{t('timeline.from')}</span>
							<select value={keys[lo]} onchange={(e) => setFrom(e.currentTarget.value)}>
								{#each episodes as ep (ep.key)}<option value={ep.key}>{ep.label}</option>{/each}
							</select>
						</label>
						<label>
							<span>{t('timeline.to')}</span>
							<select value={keys[hi]} onchange={(e) => setTo(e.currentTarget.value)}>
								{#each episodes as ep (ep.key)}<option value={ep.key}>{ep.label}</option>{/each}
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
		{:else if id === 'mapSetup'}
			<aside class="sa-card">
				{#if !store.project.map}
					<h3>{t('map.setBaseMap')}</h3>
					<p class="sa-muted">{t('map.setBaseMapHint')}</p>
					<label class="up"
						>{t('map.uploadImage')}<input type="file" accept="image/*" onchange={onUpload} /></label
					>
					<hr />
					<label>{t('map.imageUrl')}<input bind:value={imageUrl} placeholder="https://…" /></label>
					<div class="dims">
						<label>{t('map.width')}<input type="number" bind:value={width} /></label>
						<label>{t('map.height')}<input type="number" bind:value={height} /></label>
					</div>
					<button class="primary" onclick={setMap}>{t('map.setMap')}</button>
				{:else}
					<h3>{t('map.placeLocations')}</h3>
					<p class="sa-muted">{t('map.placeHint')}</p>
					{#if unplaced.length}
						<ul>
							{#each unplaced as l (l.id)}
								<li>
									<span>{l.name}</span>
									<button class:active={placingId === l.id} onclick={() => (placingId = l.id)}>
										{placingId === l.id ? t('map.clickMap') : t('map.place')}
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="sa-muted">{t('map.allPlaced')}</p>
					{/if}
					<button class="danger" onclick={() => (store.project.map = null)}>
						{t('map.changeMapImage')}
					</button>
				{/if}
			</aside>
		{:else if id === 'deaths'}
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
							</li>
						{/each}
					</ol>
				{:else}
					<p class="sa-muted">—</p>
				{/if}
			</aside>
		{:else if id === 'timeline'}
			<section class="sa-card">
				<h3>🗓️ {t('timeline.title')}</h3>
				<SceneTimeline />
			</section>
		{/if}
	{/snippet}
</DragBoard>

<style>
	.map-wrap {
		position: relative;
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
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.2rem 0;
		font-size: 0.85rem;
		opacity: 0.45;
	}
	.death-list li.occurred {
		opacity: 1;
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
	aside ul {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
	}
	aside li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}
	.up,
	.dims label {
		display: block;
		font-size: 0.85rem;
		color: var(--sa-text-dim);
	}
	.dims {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	button.active {
		border-color: var(--sa-accent);
		color: var(--sa-accent);
	}
	:global(.sa-loc-dot) {
		background: var(--sa-accent);
		border: 2px solid #000;
		border-radius: 50%;
	}
	:global(.sa-death-dot) {
		font-size: 16px;
		line-height: 1;
		text-align: center;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
	}
	:global(.sa-cluster) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #5aa9e6;
		color: #08121a;
		font: 600 11px/1 var(--sa-font-body);
		border: 2px solid #0d0d13;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
	:global(.sa-cluster.travel) {
		background: #e0a23a;
	}
	:global(.sa-cluster.dead) {
		background: #8a8a93;
	}
	:global(.sa-people-tip) {
		line-height: 1.35;
	}
</style>
