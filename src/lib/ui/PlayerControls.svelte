<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { timelineBounds } from '$lib/core/playback';
	import { t } from '$lib/i18n/i18n.svelte';

	// Keep the clock's upper bound in sync with the data.
	$effect(() => {
		clock.setMax(timelineBounds(store.project).max);
	});

	const speeds = [0.5, 1, 2, 4];

	// The episode the playhead currently sits in — episodeGroups is sorted by
	// orderStart, so the last group whose start is at or before the playhead is
	// the current one (gaps between episodes stay attributed to the previous one).
	const episodes = $derived(store.episodeGroups);
	const currentEpisode = $derived.by(() => {
		let found = episodes[0] ?? null;
		for (const ep of episodes) {
			if (ep.orderStart <= clock.current) found = ep;
			else break;
		}
		return found;
	});
	// How far the playhead has advanced through that episode's own scene range (0–1).
	const episodeProgress = $derived.by(() => {
		const ep = currentEpisode;
		if (!ep) return 0;
		const span = ep.orderEnd - ep.orderStart;
		if (span <= 0) return clock.current >= ep.orderStart ? 1 : 0;
		return Math.min(1, Math.max(0, (clock.current - ep.orderStart) / span));
	});
</script>

<div class="controls sa-card">
	<button class="primary" onclick={() => clock.toggle()}>{clock.playing ? '❚❚' : '▶'}</button>
	<input
		type="range"
		min="0"
		max={clock.max || 0}
		step="0.01"
		value={clock.current}
		oninput={(e) => clock.seek(+e.currentTarget.value)}
	/>
	<div class="pos" title="{clock.current.toFixed(1)} / {clock.max.toFixed(0)}">
		<span class="ep-label sa-muted">{currentEpisode?.label ?? '—'}</span>
		<div class="ep-progress" aria-hidden="true">
			<div class="ep-progress-fill" style:width="{episodeProgress * 100}%"></div>
		</div>
	</div>
	<label class="speed"
		><span class="speed-label">{t('player.speed')}</span>
		<select value={clock.speed} onchange={(e) => (clock.speed = +e.currentTarget.value)}>
			{#each speeds as s (s)}<option value={s}>{s}×</option>{/each}
		</select>
	</label>
</div>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	input[type='range'] {
		flex: 1;
	}
	.pos {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		min-width: 3.2rem;
	}
	.ep-label {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		font-size: 0.85rem;
	}
	.ep-progress {
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--sa-border);
		overflow: hidden;
	}
	.ep-progress-fill {
		height: 100%;
		background: var(--sa-accent);
	}
	.speed {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: auto;
		white-space: nowrap;
		font-size: 0.85rem;
		color: var(--sa-text-dim);
	}
	.speed select {
		width: auto;
	}
	@media (max-width: 480px) {
		.speed-label {
			display: none;
		}
	}
</style>
