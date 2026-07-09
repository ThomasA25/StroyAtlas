<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as THREE from 'three';
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import type { LocationId } from '$lib/core/ids';
	import { readCssVar } from './css-color';
	import BaseMapPlane from './BaseMapPlane.svelte';
	import MovementLinesLayer from './MovementLinesLayer.svelte';
	import LocationMarkersLayer from './LocationMarkersLayer.svelte';
	import CharacterClustersLayer from './CharacterClustersLayer.svelte';
	import DeathsLayer from './DeathsLayer.svelte';
	import type {
		CharacterClusterVM,
		DeathBadgeVM,
		DeathTrailVM,
		LocationMarkerVM,
		MovementLineVM
	} from './types';

	// Camera/controls/interaction wiring for the fictional 2D map: orthographic
	// top-down camera, pan+zoom only (no rotation/tilt) via OrbitControls
	// restricted accordingly. Composes the presentational layers below, which
	// receive plain view-model arrays — all filter state lives in +page.svelte.
	let {
		mapConfig,
		locationMarkers,
		movementLines,
		characterClusters,
		deathTrails,
		deathBadges,
		showLocationNames,
		showCharacterNames,
		editMode = false,
		placingId = null,
		onPlace,
		onDragLocation
	}: {
		mapConfig: { imageUrl: string; width: number; height: number };
		locationMarkers: LocationMarkerVM[];
		movementLines: MovementLineVM[];
		characterClusters: CharacterClusterVM[];
		deathTrails: DeathTrailVM[];
		deathBadges: DeathBadgeVM[];
		showLocationNames: boolean;
		showCharacterNames: boolean;
		/** Marker placement/dragging is only ever wired up by the /editor route —
		 * the /map viewer omits these props entirely, so it stays read-only. */
		editMode?: boolean;
		placingId?: LocationId | null;
		onPlace?: (x: number, y: number) => void;
		onDragLocation?: (id: LocationId, x: number, y: number) => void;
	} = $props();

	interactivity();
	const { size } = useThrelte();

	let camera = $state<THREE.OrthographicCamera>();
	let controls = $state<OrbitControlsImpl>();
	let markerScale = $state(1);
	let accentColor = $state('#8b2fe0');

	let draggingId = $state<LocationId | null>(null);
	let dragPos = $state<{ x: number; y: number } | null>(null);
	const dragOverride = $derived(
		draggingId && dragPos ? { id: draggingId, x: dragPos.x, y: dragPos.y } : null
	);

	onMount(() => {
		const readAccent = () => {
			accentColor = readCssVar(document.documentElement, '--sa-accent', accentColor);
		};
		readAccent();
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', readAccent);
		return () => media.removeEventListener('change', readAccent);
	});

	// Frustum matches the canvas size 1:1 in CSS pixels at zoom 1; kept in sync
	// on every resize without touching the user's current pan/zoom.
	$effect(() => {
		if (!camera) return;
		const { width, height } = size.current;
		if (!width || !height) return;
		camera.left = -width / 2;
		camera.right = width / 2;
		camera.top = height / 2;
		camera.bottom = -height / 2;
		camera.near = 0.1;
		camera.far = 2000;
		camera.updateProjectionMatrix();
	});

	// Fits + centers the camera on the map whenever a (new) map is loaded —
	// deliberately does not depend on `size`, so window/panel resizes don't reset
	// the user's pan/zoom.
	$effect(() => {
		if (!camera) return;
		const w = mapConfig.width;
		const h = mapConfig.height;
		const { width: cw, height: ch } = untrack(() => size.current);
		camera.zoom = cw && ch ? Math.min(cw / w, ch / h) : 1;
		camera.position.set(w / 2, h / 2, 100);
		camera.updateProjectionMatrix();
		controls?.target.set(w / 2, h / 2, 0);
		controls?.update();
	});

	$effect(() => {
		if (!controls) return;
		const update = () => {
			if (camera) markerScale = 1 / camera.zoom;
		};
		update();
		controls.addEventListener('change', update);
		return () => controls?.removeEventListener('change', update);
	});

	// Drag-end fallback: if the pointer is released outside the canvas (missing
	// both the marker's and the plane's own pointerup), this window-level
	// listener still commits the move — the reason a plain marker.on('dragend')
	// wasn't reliable before.
	let pointerUpFallback: (() => void) | null = null;

	function handlePlaneClick(x: number, y: number): void {
		if (editMode && placingId) onPlace?.(x, y);
	}

	function handlePlanePointerMove(x: number, y: number): void {
		if (draggingId) dragPos = { x, y };
	}

	function handleDragStart(id: LocationId, e: IntersectionEvent<PointerEvent>): void {
		if (!editMode) return;
		const marker = locationMarkers.find((m) => m.id === id);
		draggingId = id;
		dragPos = marker ? { x: marker.x, y: marker.y } : null;
		if (controls) controls.enabled = false;
		if (e.nativeEvent.target instanceof Element) {
			e.nativeEvent.target.setPointerCapture(e.nativeEvent.pointerId);
		}
		pointerUpFallback = commitDrag;
		window.addEventListener('pointerup', pointerUpFallback, { once: true });
	}

	function commitDrag(): void {
		if (pointerUpFallback) {
			window.removeEventListener('pointerup', pointerUpFallback);
			pointerUpFallback = null;
		}
		if (draggingId && dragPos) onDragLocation?.(draggingId, dragPos.x, dragPos.y);
		draggingId = null;
		dragPos = null;
		if (controls) controls.enabled = true;
	}
</script>

<T.OrthographicCamera makeDefault bind:ref={camera} />
<OrbitControls
	bind:ref={controls}
	{camera}
	enableRotate={false}
	screenSpacePanning={true}
	enableDamping={false}
	mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
/>

<BaseMapPlane
	imageUrl={mapConfig.imageUrl}
	width={mapConfig.width}
	height={mapConfig.height}
	onPlaneClick={handlePlaneClick}
	onPlanePointerMove={handlePlanePointerMove}
	onPlanePointerUp={commitDrag}
/>
<MovementLinesLayer lines={movementLines} height={mapConfig.height} color={accentColor} />
<DeathsLayer trails={deathTrails} badges={deathBadges} height={mapConfig.height} />
<LocationMarkersLayer
	markers={locationMarkers}
	height={mapConfig.height}
	showNames={showLocationNames}
	{editMode}
	{markerScale}
	{accentColor}
	{dragOverride}
	onDragStart={handleDragStart}
	onPointerUp={commitDrag}
/>
<CharacterClustersLayer
	clusters={characterClusters}
	height={mapConfig.height}
	showNames={showCharacterNames}
	{markerScale}
/>
