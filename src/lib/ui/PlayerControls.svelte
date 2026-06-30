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
	<span class="pos sa-muted">{clock.current.toFixed(1)} / {clock.max.toFixed(0)}</span>
	<label class="speed"
		>{t('player.speed')}
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
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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
</style>
