<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { SvelteMap } from 'svelte/reactivity';
	import { store } from '$lib/core/store.svelte';
	import type { LocationId } from '$lib/core/ids';
	import { t } from '$lib/i18n/i18n.svelte';
	import { buildLocationMarkers } from '$lib/map3d/location-view';
	import MapScene from '$lib/map3d/MapScene.svelte';
	import MapSetupPanel from '$lib/map3d/MapSetupPanel.svelte';
	import LocationPlacementPanel from '$lib/map3d/LocationPlacementPanel.svelte';
	import CoordinatesExportPanel from '$lib/map3d/CoordinatesExportPanel.svelte';

	// Authoring-only tool for placing locations on the base map. Moves are staged
	// in a local draft while edit mode is on and only committed to the project
	// (and thus persisted) on explicit Save — the /map viewer never mutates
	// coordinates at all anymore.
	let editMode = $state(false);
	let placingId = $state<LocationId | null>(null);
	const draft = new SvelteMap<LocationId, { x: number; y: number }>();
	let saved = $state(false);

	function toggleEditMode(): void {
		editMode = !editMode;
		if (!editMode) placingId = null;
	}

	// Base location markers with any staged (unsaved) moves overlaid, so the
	// canvas always reflects the draft rather than the last-saved position.
	const locationMarkers = $derived(
		buildLocationMarkers(store.project, null).map((m) => {
			const d = draft.get(m.id);
			return d ? { ...m, x: d.x, y: d.y } : m;
		})
	);

	const unplaced = $derived(
		Object.values(store.project.locations)
			.filter((l) => !draft.has(l.id) && (l.coordinates.x == null || l.coordinates.y == null))
			.map((l) => ({ id: l.id, name: l.name }))
	);

	function onPlace(x: number, y: number): void {
		if (!placingId) return;
		draft.set(placingId, { x: Math.round(x), y: Math.round(y) });
		saved = false;
		placingId = null;
	}

	function onDragLocation(id: LocationId, x: number, y: number): void {
		draft.set(id, { x: Math.round(x), y: Math.round(y) });
		saved = false;
	}

	function save(): void {
		for (const [id, pos] of draft) {
			const loc = store.project.locations[id];
			if (loc) {
				loc.coordinates.x = pos.x;
				loc.coordinates.y = pos.y;
			}
		}
		draft.clear();
		saved = true;
	}

	function discard(): void {
		draft.clear();
		placingId = null;
	}
</script>

<h1>{t('mapEditor.title')}</h1>
<p class="sa-muted">{t('mapEditor.hint')}</p>

<div class="editor-layout">
	<div class="map-wrap">
		<div class="map">
			{#if store.project.map}
				<Canvas>
					<MapScene
						mapConfig={store.project.map}
						{locationMarkers}
						movementLines={[]}
						characterClusters={[]}
						deathTrails={[]}
						deathBadges={[]}
						showLocationNames={true}
						showCharacterNames={false}
						{editMode}
						{placingId}
						{onPlace}
						{onDragLocation}
					/>
				</Canvas>
			{/if}
		</div>
	</div>
	<div class="panels">
		<MapSetupPanel />
		{#if store.project.map}
			<LocationPlacementPanel
				{editMode}
				onToggleEditMode={toggleEditMode}
				{unplaced}
				{placingId}
				onSetPlacing={(id) => (placingId = id)}
				draftCount={draft.size}
				onSave={save}
				onDiscard={discard}
				{saved}
			/>
			<CoordinatesExportPanel />
		{/if}
	</div>
</div>

<style>
	.editor-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1rem;
		align-items: start;
	}
	.map-wrap {
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		overflow: hidden;
	}
	.map {
		height: 70vh;
		background: #0c0c12;
	}
	.panels {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	@media (max-width: 800px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
