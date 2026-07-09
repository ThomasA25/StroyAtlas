<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { MapLayerZ, toWorld } from './coords';
	import { DEATH_TRAIL_COLOR, type DeathBadgeVM, type DeathTrailVM } from './types';
	import MapTooltip from './MapTooltip.svelte';

	// Death trails (dashed route up to the death point) + a per-location skull
	// badge tallying how many died there, so skulls never stack on one spot.
	let {
		trails,
		badges,
		height
	}: { trails: DeathTrailVM[]; badges: DeathBadgeVM[]; height: number } = $props();

	let hoveredLocationId = $state<string | null>(null);

	function dashedTrail(trail: DeathTrailVM): THREE.Line {
		const points = trail.points.map((p) => {
			const w = toWorld(p.x, p.y, height, MapLayerZ.DeathTrail);
			return new THREE.Vector3(w.x, w.y, w.z);
		});
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const material = new THREE.LineDashedMaterial({
			color: DEATH_TRAIL_COLOR,
			dashSize: 5,
			gapSize: 5,
			transparent: true,
			opacity: 0.75
		});
		const line = new THREE.Line(geometry, material);
		line.computeLineDistances();
		return line;
	}
</script>

{#each trails as trail (trail.characterId)}
	<T is={dashedTrail(trail)} />
{/each}

{#each badges as badge (badge.locationId)}
	{@const pos = toWorld(badge.x, badge.y, height, MapLayerZ.Badge)}
	<HTML position={[pos.x, pos.y, pos.z]}>
		<div
			class="sa-death-badge"
			onpointerenter={() => (hoveredLocationId = badge.locationId)}
			onpointerleave={() => (hoveredLocationId = null)}
			role="presentation"
		>
			💀<span class="n">{badge.count}</span>
		</div>
	</HTML>
	<MapTooltip
		content={badge.tooltip}
		visible={hoveredLocationId === badge.locationId}
		x={pos.x}
		y={pos.y}
		z={pos.z + 0.01}
		direction="top"
	/>
{/each}

<style>
	.sa-death-badge {
		transform: translate(4px, -50%);
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 15px;
		line-height: 1;
		white-space: nowrap;
		cursor: default;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
	}
	.sa-death-badge .n {
		font: 600 11px/1 var(--sa-font-body);
		color: #fff;
		background: #d23b3b;
		border-radius: 8px;
		padding: 1px 5px;
	}
</style>
