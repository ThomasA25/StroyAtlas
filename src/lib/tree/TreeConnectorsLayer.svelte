<script lang="ts">
	import { T } from '@threlte/core';
	import { TreeLayerZ, toWorld } from './coords';
	import type { TreeConnectorVM } from './types';

	/**
	 * The straight segments joining spouses to each other and parents to their
	 * children. Drawn as thin quads rather than THREE.Line because WebGL ignores
	 * `linewidth` (lines are locked to 1px on every desktop driver), and the tree
	 * needs the same 2px stroke the rest of the UI uses. Every connector that
	 * relatives-tree emits is axis-aligned, so an axis-aligned quad is exact.
	 */
	let {
		connectors,
		height,
		color
	}: { connectors: TreeConnectorVM[]; height: number; color: string } = $props();

	const THICKNESS = 2;

	function quad(c: TreeConnectorVM) {
		const a = toWorld(c.x1, c.y1, height, TreeLayerZ.Connector);
		const b = toWorld(c.x2, c.y2, height, TreeLayerZ.Connector);
		return {
			width: Math.max(Math.abs(b.x - a.x), THICKNESS),
			height: Math.max(Math.abs(b.y - a.y), THICKNESS),
			x: (a.x + b.x) / 2,
			y: (a.y + b.y) / 2,
			z: a.z
		};
	}
</script>

{#each connectors as c (c.key)}
	{@const q = quad(c)}
	<T.Mesh position={[q.x, q.y, q.z]}>
		<T.PlaneGeometry args={[q.width, q.height]} />
		<T.MeshBasicMaterial {color} />
	</T.Mesh>
{/each}
