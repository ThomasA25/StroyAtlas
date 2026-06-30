<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { runExtraction } from '$lib/extraction/client';
	import { getApiKey } from '$lib/extraction/keystore';
	import type { SourceType } from '$lib/core/contract';
	import { t } from '$lib/i18n/i18n.svelte';

	let text = $state('');
	let title = $state('');
	let url = $state('');
	let type = $state<SourceType>('wiki');
	let running = $state(false);
	let error = $state('');
	let progress = $state('');

	async function extract() {
		error = '';
		progress = '';
		const apiKey = getApiKey();
		if (!apiKey) {
			error = t('extraction.setKeyFirst');
			return;
		}
		if (!text.trim()) {
			error = t('extraction.pasteSomeText');
			return;
		}
		running = true;
		try {
			await runExtraction({
				apiKey,
				text,
				source: { title: title || 'Untitled source', url, type },
				project: store.project,
				onProgress: (done, total) =>
					(progress = t('extraction.chunkProgress', { done, total }))
			});
			progress = t('extraction.done');
			text = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}
</script>

<section class="sa-card">
	<h3>{t('extraction.title')}</h3>
	<p class="sa-muted">{t('extraction.hint')}</p>
	<div class="meta">
		<input placeholder={t('extraction.sourceTitle')} bind:value={title} />
		<input placeholder={t('extraction.sourceUrl')} bind:value={url} />
		<select bind:value={type}>
			<option value="wiki">{t('sourceType.wiki')}</option>
			<option value="transcript">{t('sourceType.transcript')}</option>
			<option value="summary">{t('sourceType.summary')}</option>
			<option value="other">{t('sourceType.other')}</option>
		</select>
	</div>
	<textarea rows="8" placeholder={t('extraction.pasteHere')} bind:value={text}></textarea>
	<div class="actions">
		<button class="primary" onclick={extract} disabled={running}>
			{running ? t('extraction.extracting') : t('extraction.extract')}
		</button>
		{#if progress}<span class="sa-muted">{progress}</span>{/if}
	</div>
	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.meta {
		display: grid;
		grid-template-columns: 2fr 2fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	textarea {
		resize: vertical;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.error {
		color: var(--sa-danger);
		margin: 0.5rem 0 0;
	}
</style>
