<script lang="ts">
	import type { LocationId } from '$lib/core/ids';
	import { t } from '$lib/i18n/i18n.svelte';

	// Edit-mode toggle + the list of still-unplaced locations, plus the explicit
	// save/discard bar for the moves staged while edit mode is on (see /editor's
	// +page.svelte, which owns the actual draft state).
	let {
		editMode,
		onToggleEditMode,
		unplaced,
		placingId,
		onSetPlacing,
		draftCount,
		onSave,
		onDiscard,
		saved
	}: {
		editMode: boolean;
		onToggleEditMode: () => void;
		unplaced: { id: LocationId; name: string }[];
		placingId: LocationId | null;
		onSetPlacing: (id: LocationId | null) => void;
		draftCount: number;
		onSave: () => void;
		onDiscard: () => void;
		saved: boolean;
	} = $props();
</script>

<aside class="sa-card">
	<h3>{t('map.placeLocations')}</h3>
	<label class="edit-toggle">
		<input type="checkbox" checked={editMode} onchange={onToggleEditMode} />
		{t('mapEditor.editMode')}
	</label>
	{#if !editMode}
		<p class="sa-muted">{t('mapEditor.editModeHint')}</p>
	{:else}
		<p class="sa-muted">{t('map.placeHint')}</p>
		{#if unplaced.length}
			<ul>
				{#each unplaced as l (l.id)}
					<li>
						<span>{l.name}</span>
						<button
							class:active={placingId === l.id}
							onclick={() => onSetPlacing(placingId === l.id ? null : l.id)}
						>
							{placingId === l.id ? t('map.clickMap') : t('map.place')}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="sa-muted">{t('map.allPlaced')}</p>
		{/if}
		<div class="save-bar">
			{#if draftCount > 0}
				<span class="sa-muted">{t('mapEditor.unsavedChanges', { count: draftCount })}</span>
				<button class="primary" onclick={onSave}>{t('mapEditor.save')}</button>
				<button class="danger" onclick={onDiscard}>{t('mapEditor.discard')}</button>
			{:else if saved}
				<span class="sa-muted">{t('mapEditor.saved')}</span>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.edit-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		margin: 0.5rem 0;
	}
	.edit-toggle input {
		width: auto;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}
	button.active {
		border-color: var(--sa-accent);
		color: var(--sa-accent);
	}
	.save-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--sa-border);
	}
</style>
