<script lang="ts">
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { MapLayerZ, toWorld } from './coords';
	import { CATEGORY_COLOR, type CharacterClusterVM } from './types';
	import MapTooltip from './MapTooltip.svelte';

	const RADIUS = 5;

	// Clock-driven character/cluster markers: one dot per rounded position, a
	// numeric badge when more than one character shares it, coloured by the
	// dominant category (dead > traveling > stationary).
	let {
		clusters,
		height,
		showNames,
		markerScale
	}: {
		clusters: CharacterClusterVM[];
		height: number;
		showNames: boolean;
		markerScale: number;
	} = $props();

	let hoveredKey = $state<string | null>(null);
</script>

{#each clusters as c (c.key)}
	{@const pos = toWorld(c.x, c.y, height, MapLayerZ.Character)}
	<T.Mesh
		position={[pos.x, pos.y, pos.z]}
		scale={markerScale}
		onpointerover={() => (hoveredKey = c.key)}
		onpointerout={() => (hoveredKey = null)}
	>
		<T.CircleGeometry args={[RADIUS, 20]} />
		<T.MeshBasicMaterial color={CATEGORY_COLOR[c.category]} />
	</T.Mesh>
	{#if c.count > 1}
		<HTML position={[pos.x, pos.y, pos.z]} pointerEvents="none">
			<div class="sa-cluster-badge">{c.count}</div>
		</HTML>
	{/if}
	<MapTooltip
		content={c.tooltip}
		visible={showNames || hoveredKey === c.key}
		x={pos.x}
		y={pos.y}
		z={pos.z + 0.01}
		direction="right"
	/>
{/each}

<style>
	.sa-cluster-badge {
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--sa-surface);
		color: var(--sa-text);
		font: 600 11px/1 var(--sa-font-body);
		border: 2px solid var(--sa-border);
		box-shadow: var(--sa-shadow);
	}
</style>
