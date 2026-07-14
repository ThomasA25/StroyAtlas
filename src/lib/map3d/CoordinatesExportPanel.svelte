<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	// Downloads the saved location coordinates as the overlay file hotd-default.ts
	// reads (data/hotd/location-coordinates.json) — the step that ships a
	// placement to every user at the next deployment, since IndexedDB is only
	// ever local to the browser that saved it.
	function download() {
		const coords: Record<string, { x: number; y: number }> = {};
		for (const loc of Object.values(store.project.locations)) {
			if (loc.coordinates.x != null && loc.coordinates.y != null) {
				coords[loc.id] = { x: loc.coordinates.x, y: loc.coordinates.y };
			}
		}
		const json = JSON.stringify(coords, null, 2) + '\n';
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'location-coordinates.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<section class="sa-card">
	<h3>{t('mapEditor.exportTitle')}</h3>
	<p class="sa-muted">{t('mapEditor.exportHint')}</p>
	<button onclick={download}>{t('mapEditor.exportCoordinates')}</button>
</section>
