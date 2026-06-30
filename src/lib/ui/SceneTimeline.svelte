<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { episodeKeyOf } from '$lib/core/derive';
	import { episodeRange } from '$lib/core/episode-filter.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	// Scene track + key events, filtered by the shared episode range. Scenes show
	// as compact one-line rows (#index + title); their details expand on request.
	const currentIndex = $derived(Math.round(clock.current));
	const keys = $derived(store.episodeGroups.map((e) => e.key));
	const selectedKeys = $derived(episodeRange.selectedKeys(keys));
	const isFullRange = $derived(episodeRange.isFull(keys));

	const scenes = $derived(
		isFullRange
			? store.timelineScenes
			: store.timelineScenes.filter((s) => selectedKeys.has(episodeKeyOf(s)))
	);
	const keyEvents = $derived(
		isFullRange
			? store.keyEvents
			: store.keyEvents.filter((k) => selectedKeys.has(episodeKeyOf(k.event)))
	);

	const expanded = new SvelteSet<string>();
	function toggle(id: string): void {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	const deathByEvent = $derived(
		new Map<string, string[]>(
			store.deathEvents.map((e) => [
				e.id as string,
				(e.deaths ?? []).map(
					(id) => store.project.characters[id as keyof typeof store.project.characters]?.name ?? id
				)
			])
		)
	);
	function sceneDeaths(eventIds: readonly string[]): string[] {
		const out: string[] = [];
		for (const id of eventIds) {
			const n = deathByEvent.get(id);
			if (n) out.push(...n);
		}
		return out;
	}
	function names(ids: readonly string[]): string {
		return ids
			.map((id) => store.project.characters[id as keyof typeof store.project.characters]?.name ?? id)
			.join(', ');
	}
	function locName(id: string | null): string {
		if (!id) return '—';
		return store.project.locations[id as keyof typeof store.project.locations]?.name ?? id;
	}
</script>

<div class="layout">
	<ol class="track">
		{#each scenes as scene (scene.id)}
			{@const open = expanded.has(scene.id)}
			{@const deaths = sceneDeaths(scene.eventIds)}
			<li class="scene" class:current={scene.orderIndex === currentIndex} class:open>
				<div class="row">
					<button
						class="seek"
						onclick={() => clock.seek(scene.orderIndex)}
						title={t('timeline.jumpHere')}>#{scene.orderIndex}</button
					>
					<button class="ttl" onclick={() => toggle(scene.id)} aria-expanded={open}>
						<span class="arrow">▸</span>
						<span class="text">{scene.startHint || t('timeline.scene')}</span>
						{#if deaths.length}<span class="skull" title={t('death.label')}>💀</span>{/if}
					</button>
				</div>
				{#if open}
					<div class="detail">
						<span class="sa-muted">@ {locName(scene.locationId)}</span>
						{#if scene.characters.length}
							<span class="sa-muted">{names(scene.characters)}</span>
						{/if}
						{#if deaths.length}
							<span class="death">💀 {deaths.join(', ')}</span>
						{/if}
						{#if scene.transitionToNext}
							<span class="trans sa-muted">→ {scene.transitionToNext}</span>
						{/if}
					</div>
				{/if}
			</li>
		{:else}
			<p class="sa-muted">{t('timeline.noScenes')}</p>
		{/each}
	</ol>

	<aside class="sa-card">
		<h3>{t('timeline.keyEvents')}</h3>
		{#if keyEvents.length}
			<ul>
				{#each keyEvents as k (k.event.id)}
					<li class:death={deathByEvent.has(k.event.id)}>
						<button onclick={() => clock.seek(k.event.orderIndex)}>#{k.event.orderIndex}</button>
						{#if deathByEvent.has(k.event.id)}<span title={t('death.label')}>💀</span>{/if}
						<span>{k.event.title}</span>
						<span class="cats">{k.categories.join(', ')}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="sa-muted">{t('timeline.noneDetected')}</p>
		{/if}
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 1rem;
		align-items: start;
	}
	.track {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
	}
	.scene {
		border-bottom: 1px solid var(--sa-border);
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.seek {
		flex: none;
		font-variant-numeric: tabular-nums;
		font-size: 0.72rem;
		padding: 0.05rem 0.35rem;
		color: var(--sa-text-dim);
	}
	.ttl {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		text-align: left;
		background: none;
		border: none;
		border-radius: 0;
		padding: 0.25rem 0;
		font-size: 0.85rem;
		color: var(--sa-text);
		cursor: pointer;
	}
	.ttl:hover {
		color: var(--sa-accent);
		background: none;
	}
	.ttl .arrow {
		flex: none;
		font-size: 0.7rem;
		color: var(--sa-text-dim);
		transition: transform 0.15s;
	}
	.scene.open .ttl .arrow {
		transform: rotate(90deg);
	}
	.scene.current .ttl .text {
		color: var(--sa-accent);
		font-weight: 600;
	}
	.skull {
		flex: none;
		font-size: 0.8rem;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0 0 0.45rem 2.3rem;
		font-size: 0.8rem;
	}
	.death {
		color: var(--sa-danger);
		font-weight: 500;
	}
	.trans {
		font-style: italic;
	}
	aside li.death span:not(.cats) {
		color: var(--sa-danger);
	}
	aside ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	aside li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0;
		font-size: 0.85rem;
	}
	.cats {
		margin-left: auto;
		color: var(--sa-text-dim);
		font-size: 0.75rem;
	}
	@media (max-width: 720px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
