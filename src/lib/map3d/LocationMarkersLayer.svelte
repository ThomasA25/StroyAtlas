<script lang="ts">
	import { T } from '@threlte/core';
	import type { IntersectionEvent } from '@threlte/extras';
	import type { LocationId } from '$lib/core/ids';
	import { MapLayerZ, toWorld } from './coords';
	import type { LocationMarkerVM, TooltipContent } from './types';
	import MapTooltip from './MapTooltip.svelte';

	const RADIUS = 5;

	// Location dots + name labels. In EDIT_MODE a marker can be dragged; this
	// layer only reports the gesture (start drag / hover), the live drag position
	// and store commit are owned by MapScene so pan-controls and the drag can be
	// coordinated with the base map plane's pointer events.
	let {
		markers,
		height,
		showNames,
		editMode,
		markerScale,
		accentColor,
		dragOverride,
		onDragStart,
		onPointerUp
	}: {
		markers: LocationMarkerVM[];
		height: number;
		showNames: boolean;
		editMode: boolean;
		markerScale: number;
		accentColor: string;
		dragOverride: { id: LocationId; x: number; y: number } | null;
		onDragStart: (id: LocationId, e: IntersectionEvent<PointerEvent>) => void;
		onPointerUp: () => void;
	} = $props();

	let hoveredId = $state<LocationId | null>(null);

	function positionOf(m: LocationMarkerVM) {
		const live = dragOverride?.id === m.id ? dragOverride : m;
		return toWorld(live.x, live.y, height, MapLayerZ.Location);
	}

	function tooltipOf(m: LocationMarkerVM): TooltipContent {
		return { groups: [{ label: '', lines: [{ text: m.name, color: '' }] }] };
	}
</script>

{#each markers as m (m.id)}
	{@const pos = positionOf(m)}
	<T.Mesh
		position={[pos.x, pos.y, pos.z]}
		scale={markerScale}
		onpointerover={() => (hoveredId = m.id)}
		onpointerout={() => (hoveredId = null)}
		onpointerdown={(e: IntersectionEvent<PointerEvent>) => {
			if (!editMode) return;
			e.stopPropagation();
			onDragStart(m.id, e);
		}}
		onpointerup={onPointerUp}
	>
		<T.CircleGeometry args={[RADIUS, 20]} />
		<T.MeshBasicMaterial color={accentColor} />
	</T.Mesh>
	<MapTooltip
		content={tooltipOf(m)}
		visible={showNames || hoveredId === m.id}
		x={pos.x}
		y={pos.y}
		z={pos.z + 0.01}
		direction="top"
	/>
{/each}
