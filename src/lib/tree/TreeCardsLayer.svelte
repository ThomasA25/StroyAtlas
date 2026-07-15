<script lang="ts">
	import { HTML } from '@threlte/extras';
	import type { CharacterId } from '$lib/core/ids';
	import { TreeLayerZ, toWorld } from './coords';
	import type { TreeCardVM } from './types';

	/**
	 * The character cards. Rendered as real DOM through <HTML> rather than as
	 * meshes with texture text: that keeps the app's CSS theming, keeps the names
	 * crisp at any zoom, and keeps each card a focusable, screen-reader-readable
	 * <button> — all of which a WebGL-drawn card would lose.
	 *
	 * HTML overlays are plain CSS and ignore the camera, so `scale` (the camera's
	 * zoom, from FamilyTreeScene) is applied manually to keep the cards locked to
	 * the connector geometry beneath them.
	 */
	let {
		cards,
		height,
		scale,
		onSelect
	}: {
		cards: TreeCardVM[];
		height: number;
		scale: number;
		onSelect: (id: CharacterId) => void;
	} = $props();

	/**
	 * A genuine, non-delegated `addEventListener` — see the comment at the
	 * button's `use:` below for why an `onpointerdown={...}` attribute cannot do
	 * this job. `capture: true` is what actually matters: it runs before *any*
	 * bubble-phase listener anywhere in the tree, including OrbitControls' own,
	 * so calling stopPropagation() here reliably keeps it from ever seeing the
	 * event, regardless of where OrbitControls happens to be attached.
	 */
	function stopPointerdownCapture(node: HTMLElement) {
		const handler = (e: PointerEvent) => e.stopPropagation();
		node.addEventListener('pointerdown', handler, { capture: true });
		return { destroy: () => node.removeEventListener('pointerdown', handler, { capture: true }) };
	}
</script>

{#each cards as card (card.key)}
	{@const pos = toWorld(
		card.left + card.width / 2,
		card.top + card.height / 2,
		height,
		TreeLayerZ.Card
	)}
	<!--
		A collapsed zIndexRange pins every card to the same z-index. <HTML> maps
		camera distance linearly across this range, and its default [16777271, 0]
		put the cards in the millions — which, since the Threlte container is not a
		stacking context, landed them in the root one and painted them straight over
		the profile modal. Collapsing the range zeroes that slope: the cards are
		coplanar and never overlap, so depth ordering between them buys nothing,
		while a spread range would also drive far-out cards (a wide tree exceeds the
		camera's `far`) to negative z-indices and hide them behind the canvas.
		5 clears the canvas below and stays well under the modal above.
	-->
	<HTML position={[pos.x, pos.y, pos.z]} zIndexRange={[5, 5]}>
		<div
			class="sa-tree-slot"
			class:root={card.isRoot}
			style:--sa-card-scale={scale}
			style:--sa-slot-w="{card.width}px"
			style:--sa-slot-h="{card.height}px"
			style:--accent={card.accent}
		>
			<!--
				OrbitControls listens for pointerdown on the Canvas's outer wrapper div —
				the very element <HTML> portals this button into as a sibling of
				<canvas> — and unconditionally calls setPointerCapture() on it (see
				three.js OrbitControls.js). That redirects the matching pointerup to the
				wrapper instead of the button, so the browser never synthesizes a click
				and onSelect silently never fires.

				An `onpointerdown={...}` attribute does NOT fix this: Svelte 5 delegates
				common events like pointerdown through a single ancestor listener rather
				than attaching one per element, so the handler only runs once the native
				event has already bubbled up (past OrbitControls' own real listener) —
				confirmed by tracing actual call order. `use:` runs a real, immediate
				`addEventListener`, so it fires in genuine capture order and can stop the
				event before OrbitControls ever sees it. Panning still works everywhere
				else on the canvas; only this card's own pointerdown is intercepted.
			-->
			<button
				class="sa-tree-card"
				use:stopPointerdownCapture
				onclick={() => onSelect(card.id)}
				title={card.name}
			>
				<span class="sa-tree-name">{card.name}</span>
			</button>
		</div>
	</HTML>
{/each}

<style>
	.sa-tree-slot {
		/* The slot is the layout cell; the padding is what becomes the visible gap
		   between neighbouring cards. */
		width: var(--sa-slot-w);
		height: var(--sa-slot-h);
		box-sizing: border-box;
		padding: 22px 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Transform functions apply right-to-left: scale first (around the slot's
		   own centre), then the -50% offset anchors that centre on the world
		   position — so zooming never nudges a card off its spot. */
		transform: translate(-50%, -50%) scale(var(--sa-card-scale, 1));
	}

	.sa-tree-card {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--sa-border);
		border-top: 3px solid var(--accent, var(--sa-border));
		border-radius: var(--sa-radius);
		background: var(--sa-surface-2);
		color: var(--sa-text);
		box-shadow: var(--sa-shadow);
		cursor: pointer;
		font: inherit;
		line-height: 1.2;
		transition: border-color 0.08s ease;
	}

	.sa-tree-card:hover {
		border-color: var(--accent, var(--sa-border));
	}

	.sa-tree-slot.root .sa-tree-card {
		outline: 2px solid var(--accent, var(--sa-border));
		outline-offset: 1px;
	}

	.sa-tree-name {
		font-weight: 600;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
</style>
