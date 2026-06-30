<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { exportProjectToJson, importProjectFromJson } from '$lib/core/serialization';
	import type { Project } from '$lib/core/model';
	import { t } from '$lib/i18n/i18n.svelte';

	let error = $state('');
	let info = $state('');

	function download() {
		const json = exportProjectToJson($state.snapshot(store.project) as Project);
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${store.project.meta.series || 'storyatlas'}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function onFile(event: Event) {
		error = '';
		info = '';
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			store.load(importProjectFromJson(await file.text()));
			info = t('projectIo.imported', { name: file.name });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		input.value = '';
	}

	function reset() {
		if (confirm(t('projectIo.confirmReset'))) store.reset();
	}
</script>

<section class="sa-card">
	<h3>{t('projectIo.title')}</h3>
	<div class="actions">
		<button onclick={download}>{t('projectIo.exportJson')}</button>
		<label class="import">
			{t('projectIo.importJson')}
			<input type="file" accept="application/json,.json" onchange={onFile} hidden />
		</label>
		<button class="danger" onclick={reset}>{t('projectIo.reset')}</button>
	</div>
	{#if info}<p class="sa-muted">{info}</p>{/if}
	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.import {
		border: 1px solid var(--sa-border);
		background: var(--sa-surface-2);
		border-radius: var(--sa-radius);
		padding: 0.35rem 0.7rem;
		cursor: pointer;
	}
	.import:hover {
		border-color: var(--sa-accent);
	}
	.error {
		color: var(--sa-danger);
		margin: 0.5rem 0 0;
	}
</style>
