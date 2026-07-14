<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	// Base-map image setup (upload / URL + dimensions) — the fictional canvas
	// that location coordinates are placed against. Authoring-only.
	let imageUrl = $state('');
	let width = $state(1000);
	let height = $state(1000);

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
</script>

<section class="sa-card">
	<h3>{t('map.setBaseMap')}</h3>
	{#if !store.project.map}
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
		<p class="sa-muted">
			{store.project.map.imageUrl} ({store.project.map.width}×{store.project.map.height})
		</p>
		<button class="danger" onclick={() => (store.project.map = null)}>
			{t('map.changeMapImage')}
		</button>
	{/if}
</section>

<style>
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
</style>
