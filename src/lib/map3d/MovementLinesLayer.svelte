<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { MapLayerZ, toWorld } from './coords';
	import type { MovementLineVM } from './types';

	const OPACITY = 0.35;

	// Faint lines tracing each character's location-to-location journeys.
	let { lines, height, color }: { lines: MovementLineVM[]; height: number; color: string } =
		$props();

	function build(line: MovementLineVM, lineColor: string): THREE.Line {
		const a = toWorld(line.from.x, line.from.y, height, MapLayerZ.Movement);
		const b = toWorld(line.to.x, line.to.y, height, MapLayerZ.Movement);
		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(a.x, a.y, a.z),
			new THREE.Vector3(b.x, b.y, b.z)
		]);
		const material = new THREE.LineBasicMaterial({
			color: lineColor,
			transparent: true,
			opacity: OPACITY
		});
		return new THREE.Line(geometry, material);
	}
</script>

{#each lines as line, i (i)}
	<T is={build(line, color)} />
{/each}
