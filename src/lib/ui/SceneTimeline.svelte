<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { episodeKeyOf, KEY_EVENT_CATEGORIES, type KeyEvent, type KeyEventCategory } from '$lib/core/derive';
	import { episodeRange } from '$lib/core/episode-filter.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	// Marker colour per key-event category, shared by the legend and the strip.
	const CATEGORY_COLOR: Record<KeyEventCategory, string> = {
		death: 'var(--sa-danger)',
		battle: '#e0a23a',
		politics: '#5aa9e6'
	};

	// Horizontal key-events strip, filtered by the shared episode range.
	const currentIndex = $derived(Math.round(clock.current));
	const keys = $derived(store.episodeGroups.map((e) => e.key));
	const selectedKeys = $derived(episodeRange.selectedKeys(keys));
	const isFullRange = $derived(episodeRange.isFull(keys));

	const keyEvents = $derived(
		isFullRange
			? store.keyEvents
			: store.keyEvents.filter((k) => selectedKeys.has(episodeKeyOf(k.event)))
	);
	// Episode boundaries drawn into the strip's background, so the key-events
	// axis reads against the same episode structure as the Von/Bis filter above.
	const episodesInView = $derived(
		isFullRange
			? store.episodeGroups
			: store.episodeGroups.filter((e) => selectedKeys.has(e.key))
	);

	// Position by order_index against the clock's full range, so the playhead
	// and event markers share one axis.
	let hoveredCategory = $state<KeyEventCategory | null>(null);
	let hoveredEventId = $state<string | null>(null);
	let selectedEventId = $state<string | null>(null);
	const selectedEvent = $derived(keyEvents.find((k) => k.event.id === selectedEventId) ?? null);

	function pct(orderIndex: number): number {
		if (clock.max <= 0) return 0;
		return Math.min(100, Math.max(0, (orderIndex / clock.max) * 100));
	}

	function selectEvent(k: KeyEvent): void {
		selectedEventId = k.event.id;
		clock.seek(k.event.orderIndex);
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

<section class="sa-card key-events">
	<h3>{t('timeline.keyEvents')}</h3>
	{#if keyEvents.length}
		<div class="legend">
			{#each KEY_EVENT_CATEGORIES as cat (cat)}
				<button
					type="button"
					class="legend-chip"
					class:dimmed={hoveredCategory != null && hoveredCategory !== cat}
					onmouseenter={() => (hoveredCategory = cat)}
					onmouseleave={() => (hoveredCategory = null)}
					onfocus={() => (hoveredCategory = cat)}
					onblur={() => (hoveredCategory = null)}
				>
					<span class="swatch" style:background={CATEGORY_COLOR[cat]}></span>
					{t(`eventCategory.${cat}`)}
				</button>
			{/each}
		</div>
		<div class="strip">
			<div class="axis"></div>
			{#each episodesInView as ep (ep.key)}
				<div class="episode-divider" style:left="{pct(ep.orderStart)}%" title={ep.label}></div>
			{/each}
			<div class="playhead" style:left="{pct(currentIndex)}%"></div>
			{#each keyEvents as k (k.event.id)}
				{@const active = hoveredCategory != null && k.categories.includes(hoveredCategory)}
				{@const dimmed = hoveredCategory != null && !active}
				<button
					class="marker"
					class:active
					class:dimmed
					class:selected={selectedEventId === k.event.id}
					style:left="{pct(k.event.orderIndex)}%"
					onclick={() => selectEvent(k)}
					onmouseenter={() => (hoveredEventId = k.event.id)}
					onmouseleave={() => (hoveredEventId = null)}
					onfocus={() => (hoveredEventId = k.event.id)}
					onblur={() => (hoveredEventId = null)}
				>
					{#each k.categories as cat (cat)}
						<span class="dot" style:background={CATEGORY_COLOR[cat]}></span>
					{/each}
				</button>
				{#if hoveredEventId === k.event.id}
					<div class="marker-tooltip" style:left="{pct(k.event.orderIndex)}%">
						{k.event.title}
					</div>
				{/if}
			{/each}
		</div>
		{#if selectedEvent}
			{@const eventDeaths = deathByEvent.get(selectedEvent.event.id) ?? []}
			<div class="event-detail">
				<div class="event-detail-head">
					<button class="seek" onclick={() => clock.seek(selectedEvent.event.orderIndex)}
					>#{selectedEvent.event.orderIndex}</button
					>
					<strong>{selectedEvent.event.title}</strong>
					{#each selectedEvent.categories as cat (cat)}
						<span class="cat-chip" style:color={CATEGORY_COLOR[cat]}
						>{t(`eventCategory.${cat}`)}</span
						>
					{/each}
				</div>
				<span class="sa-muted">@ {locName(selectedEvent.event.locationId)}</span>
				{#if selectedEvent.event.charactersInvolved.length}
					<span class="sa-muted">{names(selectedEvent.event.charactersInvolved)}</span>
				{/if}
				{#if eventDeaths.length}
					<span class="death">💀 {eventDeaths.join(', ')}</span>
				{/if}
			</div>
		{/if}
	{:else}
		<p class="sa-muted">{t('timeline.noneDetected')}</p>
	{/if}
</section>

<style>
	.death {
		color: var(--sa-danger);
		font-weight: 500;
	}
	.key-events h3 {
		margin-bottom: 0.6rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 2rem;
	}
	.legend-chip {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: auto;
		padding: 0.2rem 0.55rem;
		font-size: 0.78rem;
		background: var(--sa-surface-2);
		border: 1px solid var(--sa-border);
		border-radius: 999px;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.legend-chip.dimmed {
		opacity: 0.4;
	}
	.legend-chip .swatch {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		flex: none;
	}
	.strip {
		position: relative;
		height: 3rem;
		margin: 0 0.5rem;
	}
	.strip .axis {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--sa-border);
	}
	.strip .episode-divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--sa-border);
	}
	.strip .playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--sa-accent);
		transform: translateX(-1px);
	}
	.strip .marker {
		position: absolute;
		top: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: auto;
		padding: 0;
		background: none;
		border: none;
		border-radius: 0;
		transform: translate(-50%, -50%);
		cursor: pointer;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}
	.strip .marker .dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		border: 1px solid var(--sa-surface);
	}
	.strip .marker.dimmed {
		opacity: 0.25;
	}
	.strip .marker.active .dot {
		box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 35%, transparent);
	}
	.strip .marker.active,
	.strip .marker.selected {
		transform: translate(-50%, -50%) scale(1.3);
	}
	.strip .marker-tooltip {
		position: absolute;
		bottom: 50%;
		margin-bottom: 0.85rem;
		transform: translateX(-50%);
		background: var(--sa-surface);
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		padding: 0.2rem 0.55rem;
		font-size: 0.75rem;
		white-space: nowrap;
		box-shadow: var(--sa-shadow);
		pointer-events: none;
		z-index: 5;
	}
	.event-detail {
		display: flex;
		flex-wrap: wrap;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.75rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--sa-border);
		font-size: 0.82rem;
	}
	.event-detail-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.cat-chip {
		font-size: 0.72rem;
		font-weight: 500;
	}
</style>
