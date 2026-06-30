<script lang="ts">
	import { getApiKey, setApiKey, clearApiKey } from '$lib/extraction/keystore';
	import { t } from '$lib/i18n/i18n.svelte';

	let key = $state(getApiKey());
	let saved = $state(getApiKey().length > 0);

	function save() {
		setApiKey(key);
		saved = key.trim().length > 0;
	}
	function clear() {
		clearApiKey();
		key = '';
		saved = false;
	}
</script>

<section class="sa-card">
	<h3>{t('apiKey.title')}</h3>
	<p class="sa-muted">{t('apiKey.hint')}</p>
	<div class="row">
		<input type="password" placeholder="sk-ant-..." bind:value={key} autocomplete="off" />
		<button class="primary" onclick={save}>{t('common.save')}</button>
		<button onclick={clear}>{t('common.clear')}</button>
	</div>
	<p class="status" class:ok={saved}>{saved ? t('apiKey.keySet') : t('apiKey.noKey')}</p>
</section>

<style>
	.row {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0.25rem;
	}
	.row :global(button) {
		white-space: nowrap;
	}
	.status {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sa-text-dim);
	}
	.status.ok {
		color: var(--sa-accent);
	}
</style>
