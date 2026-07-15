<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import type { CharacterId } from '$lib/core/ids';
	import {
		buildFamilyGroups,
		buildFamilyLayout,
		buildProfile,
		pickFamilyRoot
	} from '$lib/tree/family-view';
	import FamilyTreeCanvas from '$lib/tree/FamilyTreeCanvas.svelte';
	import CharacterProfileModal from '$lib/tree/CharacterProfileModal.svelte';

	// Read-only viewer over the derived family graph. All logic lives in
	// $lib/tree/family-view.ts; this page only holds the two pieces of UI state
	// (which family is shown, which card is open) and wires the builders to the
	// presentational components.

	const nodes = $derived(store.familyTree);
	const families = $derived(buildFamilyGroups(nodes, store.project));

	// Selected family; defaults to the largest and re-validates whenever the data
	// changes (e.g. a language switch reseeds the project).
	let selectedHouse = $state('');
	$effect(() => {
		if (selectedHouse && families.some((f) => f.house === selectedHouse)) return;
		selectedHouse = families[0]?.house ?? '';
	});

	const rootId = $derived.by(() => {
		const family = families.find((f) => f.house === selectedHouse) ?? families[0];
		return family ? pickFamilyRoot(nodes, family.memberIds) : null;
	});
	const layout = $derived(buildFamilyLayout(nodes, rootId, store.project));

	let selectedId = $state<CharacterId | null>(null);
	const profile = $derived(selectedId ? buildProfile(store.project.characters[selectedId]) : null);
</script>

<div class="head">
	<h1>{t('tree.title')}</h1>
	{#if families.length}
		<label class="family-pick">
			<span class="sa-muted">{t('tree.family')}</span>
			<select bind:value={selectedHouse}>
				{#each families as family (family.house)}
					<option value={family.house}>{family.house} ({family.memberIds.length})</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if layout}
	<FamilyTreeCanvas {layout} onSelect={(id) => (selectedId = id)} />
{:else}
	<p class="sa-muted empty">{t('tree.empty')}</p>
{/if}

{#if profile}
	<CharacterProfileModal {profile} onClose={() => (selectedId = null)} />
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	.family-pick {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.family-pick select {
		width: auto;
	}

	.empty {
		padding: 2rem 0;
		text-align: center;
	}
</style>
