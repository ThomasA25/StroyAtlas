<script lang="ts">
	import { T } from '@threlte/core';
	import { useTexture } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
	import { MapLayerZ, toPixel } from './coords';

	// The fictional base map image as a textured plane — replaces Leaflet's
	// L.imageOverlay. Also the click/drag surface for EDIT_MODE authoring: pixel
	// coordinates are resolved here (where the raycast hit is known) and reported
	// up via callbacks; the caller owns the actual store mutation.
	let {
		imageUrl,
		width,
		height,
		onPlaneClick,
		onPlanePointerMove,
		onPlanePointerUp
	}: {
		imageUrl: string;
		width: number;
		height: number;
		onPlaneClick?: (x: number, y: number) => void;
		onPlanePointerMove?: (x: number, y: number) => void;
		onPlanePointerUp?: () => void;
	} = $props();

	function pixelOf(e: IntersectionEvent<PointerEvent | MouseEvent>): { x: number; y: number } {
		return toPixel(e.point.x, e.point.y, height);
	}
</script>

{#key imageUrl}
	{#await useTexture(imageUrl) then texture}
		<T.Mesh
			position={[width / 2, height / 2, MapLayerZ.Base]}
			onclick={(e: IntersectionEvent<MouseEvent>) => {
				const { x, y } = pixelOf(e);
				onPlaneClick?.(x, y);
			}}
			onpointermove={(e: IntersectionEvent<PointerEvent>) => {
				const { x, y } = pixelOf(e);
				onPlanePointerMove?.(x, y);
			}}
			onpointerup={() => onPlanePointerUp?.()}
		>
			<T.PlaneGeometry args={[width, height]} />
			<T.MeshBasicMaterial map={texture} toneMapped={false} />
		</T.Mesh>
	{/await}
{/key}
