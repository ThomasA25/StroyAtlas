<script lang="ts">
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { MapLayerZ, toWorld } from './coords';
	import { CATEGORY_COLOR, type CharacterClusterVM } from './types';
	import MapTooltip from './MapTooltip.svelte';

	const RADIUS = 5;

	// Clock-driven character/cluster markers: one dot per rounded position, a
	// numeric badge when more than one character shares it, coloured by the
	// dominant category (dead > traveling > stationary). A cluster that is
	// entirely dragons renders as a dragon icon instead of a dot, so dragons
	// read distinctly from people; a mixed cluster (e.g. a rider + their
	// dragon) keeps the dot but gets a small dragon badge alongside it.
	let {
		clusters,
		height,
		showNames,
		iconScale,
		circleScale
	}: {
		clusters: CharacterClusterVM[];
		height: number;
		showNames: boolean;
		/** Grows/shrinks with camera zoom (unlike location pins, which stay a
		 * constant screen size) — see `characterScale` in MapScene.svelte. Drives
		 * the HTML dragon/badge overlays (plain CSS, unaffected by camera zoom). */
		iconScale: number;
		/** Same capped curve as `iconScale`, but pre-divided by camera zoom so the
		 * T.Mesh circle (which the camera's own zoom already scales) ends up at
		 * the same apparent size instead of growing unbounded. */
		circleScale: number;
	} = $props();

	let hoveredKey = $state<string | null>(null);
</script>

{#each clusters as c (c.key)}
	{@const pos = toWorld(c.x, c.y, height, MapLayerZ.Character)}
	{#if c.allDragons}
		<HTML position={[pos.x, pos.y, pos.z]}>
			<div
				class="sa-dragon-marker"
				role="presentation"
				style:--sa-dragon-angle="{c.dragonAngleDeg ?? 0}deg"
				style:--sa-icon-scale={iconScale * c.dragonSizeScale}
				onpointerenter={() => (hoveredKey = c.key)}
				onpointerleave={() => (hoveredKey = null)}
			></div>
		</HTML>
	{:else}
		<T.Mesh
			position={[pos.x, pos.y, pos.z]}
			scale={circleScale}
			onpointerover={() => (hoveredKey = c.key)}
			onpointerout={() => (hoveredKey = null)}
		>
			<T.CircleGeometry args={[RADIUS, 20]} />
			<T.MeshBasicMaterial color={CATEGORY_COLOR[c.category]} />
		</T.Mesh>
		{#if c.hasDragon}
			<HTML position={[pos.x, pos.y, pos.z]} pointerEvents="none">
				<div
					class="sa-dragon-badge"
					style:--sa-dragon-angle="{c.dragonAngleDeg ?? 0}deg"
					style:--sa-icon-scale={iconScale * c.dragonSizeScale}
				></div>
			</HTML>
		{/if}
	{/if}
	{#if c.count > 1}
		<HTML position={[pos.x, pos.y, pos.z]} pointerEvents="none">
			<div class="sa-cluster-badge" style:--sa-icon-scale={iconScale}>{c.count}</div>
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
		transform: translate(-50%, -50%) scale(var(--sa-icon-scale, 1));
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
	.sa-dragon-marker,
	.sa-dragon-badge {
		background-color: #cda45e;
		mask-image: url('/drache.svg');
		-webkit-mask-image: url('/drache.svg');
		mask-repeat: no-repeat;
		-webkit-mask-repeat: no-repeat;
		mask-size: contain;
		-webkit-mask-size: contain;
		mask-position: center;
		-webkit-mask-position: center;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7));
	}
	.sa-dragon-marker {
		/* Transform functions apply right-to-left: scale first (around the
		   icon's own center), then rotate, then the fixed position offset last —
		   so growing/shrinking with zoom never disturbs the anchor placement. */
		transform: translate(-50%, -50%) rotate(var(--sa-dragon-angle, 0deg)) scale(var(--sa-icon-scale, 1));
		width: 55px;
		height: 52px;
	}
	.sa-dragon-badge {
		/* Same base size as .sa-dragon-marker — a dragon's apparent size must only
		   depend on --sa-icon-scale (zoom × lore size), never on whether it happens
		   to share its cluster with a rider (badge) or stand alone (marker).
		   Mismatched base sizes here previously caused a jarring jump the moment a
		   rider died and the cluster flipped from badge to marker mid-timeline. */
		transform: translate(calc(-50% - 10px), calc(-50% - 10px)) rotate(var(--sa-dragon-angle, 0deg))
			scale(var(--sa-icon-scale, 1));
		width: 55px;
		height: 52px;
	}
</style>
