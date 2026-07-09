<script lang="ts">
	import { HTML } from '@threlte/extras';
	import type { TooltipContent } from './types';

	// Shared HTML-anchored tooltip for location labels, character clusters, and
	// death badges. Content is structured data (colour-tinted lines/groups), so
	// Svelte's normal text interpolation handles escaping — no manual HTML
	// escaping needed, unlike the old Leaflet string-built tooltips.
	let {
		content,
		visible,
		x,
		y,
		z,
		direction = 'top'
	}: {
		content: TooltipContent;
		visible: boolean;
		x: number;
		y: number;
		z: number;
		direction?: 'top' | 'right';
	} = $props();
</script>

{#if visible && content.groups.length}
	<HTML position={[x, y, z]} pointerEvents="none">
		<div class="sa-map-tooltip" class:dir-right={direction === 'right'}>
			{#each content.groups as group, gi (gi)}
				{#if group.label}<strong>{group.label}</strong>{/if}
				{#each group.lines as line, li (li)}
					<div style:color={line.color || 'inherit'}>{line.dead ? '† ' : ''}{line.text}</div>
				{/each}
			{/each}
		</div>
	</HTML>
{/if}

<style>
	.sa-map-tooltip {
		background: color-mix(in srgb, var(--sa-surface) 92%, transparent);
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		padding: 0.2rem 0.45rem;
		font-size: 0.78rem;
		line-height: 1.35;
		white-space: nowrap;
		box-shadow: var(--sa-shadow);
		transform: translate(-50%, calc(-100% - 8px));
	}
	.sa-map-tooltip.dir-right {
		transform: translate(8px, -50%);
	}
</style>
