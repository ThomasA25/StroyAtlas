<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import type { CharacterId } from '$lib/core/ids';
	import { readCssVar } from '$lib/ui/css-color';
	import TreeConnectorsLayer from './TreeConnectorsLayer.svelte';
	import TreeCardsLayer from './TreeCardsLayer.svelte';
	import type { FamilyLayoutVM } from './types';

	/**
	 * Camera/controls wiring for the family tree: the same orthographic,
	 * pan+zoom-only setup the map uses (OrbitControls with rotation disabled), so
	 * both views handle identically. Composes the presentational layers below,
	 * which receive plain view-model data — all logic lives in family-view.ts.
	 */
	let {
		layout,
		onSelect
	}: { layout: FamilyLayoutVM; onSelect: (id: CharacterId) => void } = $props();

	interactivity();
	// The Canvas renders on demand and cannot see a camera mutated directly from
	// an effect, so those effects ask for a frame via `invalidate()`.
	const { size, invalidate } = useThrelte();

	let camera = $state<THREE.OrthographicCamera>();
	let controls = $state<OrbitControlsImpl>();
	/**
	 * The camera's zoom, mirrored onto the HTML cards. They are plain DOM and so
	 * ignore the camera on their own; without this they would keep a constant
	 * screen size while the connectors scaled, and the tree would fall apart.
	 */
	let cardScale = $state(1);
	let lineColor = $state('#3a3a44');

	/** Leaves a small margin so a fitted tree never touches the viewport edges. */
	const FIT_PADDING = 0.92;

	onMount(() => {
		const readColors = () => {
			lineColor = readCssVar(document.documentElement, '--sa-border', lineColor);
		};
		readColors();
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', readColors);
		return () => media.removeEventListener('change', readColors);
	});

	// Frustum matches the canvas size 1:1 in CSS pixels at zoom 1; kept in sync on
	// every resize without touching the user's current pan/zoom.
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
		invalidate();
	});

	/**
	 * The tree this camera has already been fitted to. Plain (non-reactive) on
	 * purpose: it is only bookkeeping, and making it $state would feed the effect
	 * below back into itself.
	 */
	let fittedLayout: FamilyLayoutVM | null = null;

	// Fits + centers the camera on the tree, once per tree. `size` is tracked
	// rather than untracked because the canvas can report its real size *after*
	// this first runs — untracking it would strand the camera at zoom 1 forever.
	// Re-fitting is then keyed on the layout object, so picking another family
	// re-frames the view while a mere window resize leaves the user's pan/zoom be.
	$effect(() => {
		const { width: cw, height: ch } = size.current;
		const w = layout.width;
		const h = layout.height;
		if (!camera || !controls || !w || !h || !cw || !ch) return;
		if (fittedLayout === layout) return;
		fittedLayout = layout;

		camera.zoom = Math.min(cw / w, ch / h) * FIT_PADDING;
		camera.position.set(w / 2, h / 2, 100);
		camera.updateProjectionMatrix();
		controls.target.set(w / 2, h / 2, 0);
		controls.update();
		cardScale = camera.zoom;
		invalidate();
	});

	// Keep the cards in step with every user zoom.
	$effect(() => {
		if (!controls) return;
		const update = () => {
			if (camera) cardScale = camera.zoom;
		};
		update();
		controls.addEventListener('change', update);
		return () => controls?.removeEventListener('change', update);
	});
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

<TreeConnectorsLayer connectors={layout.connectors} height={layout.height} color={lineColor} />
<TreeCardsLayer cards={layout.cards} height={layout.height} scale={cardScale} {onSelect} />
