<script lang="ts">
	import ApiKeyPanel from '$lib/ui/ApiKeyPanel.svelte';
	import ExtractionPanel from '$lib/ui/ExtractionPanel.svelte';
	import ProjectIoPanel from '$lib/ui/ProjectIoPanel.svelte';
	import InspectorPanel from '$lib/ui/InspectorPanel.svelte';
	import DragBoard from '$lib/ui/DragBoard.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	const items = $derived([
		{ id: 'apiKey', label: t('apiKey.title'), rows: 3 },
		{ id: 'projectIo', label: t('projectIo.title'), rows: 2 },
		{ id: 'extraction', label: t('extraction.title'), rows: 5 },
		{ id: 'inspector', label: t('inspector.story'), rows: 8 }
	]);
</script>

<h1>{t('editor.title')}</h1>

<DragBoard board="editor" {items}>
	{#snippet widget(id)}
		{#if id === 'apiKey'}
			<ApiKeyPanel />
		{:else if id === 'projectIo'}
			<ProjectIoPanel />
		{:else if id === 'extraction'}
			<ExtractionPanel />
		{:else if id === 'inspector'}
			<InspectorPanel />
		{/if}
	{/snippet}
</DragBoard>
