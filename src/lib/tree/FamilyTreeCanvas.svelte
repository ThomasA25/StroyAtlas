<script lang="ts">
	import type { CharacterId } from '$lib/core/ids';
	import type { FamilyLayoutVM } from './types';

	/**
	 * Draws a pre-computed family tree layout: an SVG connector layer with the
	 * character cards positioned on top. Purely presentational — every position,
	 * colour and label is already resolved by family-view.buildFamilyLayout().
	 */
	interface Props {
		layout: FamilyLayoutVM;
		onSelect: (id: CharacterId) => void;
	}

	let { layout, onSelect }: Props = $props();
</script>

<div class="tree-scroll">
	<div class="tree-canvas" style:width="{layout.width}px" style:height="{layout.height}px">
		<svg class="connectors" width={layout.width} height={layout.height} aria-hidden="true">
			{#each layout.connectors as c (c.key)}
				<line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
			{/each}
		</svg>
		{#each layout.cards as card (card.key)}
			<div
				class="node"
				class:root={card.isRoot}
				style:left="{card.left}px"
				style:top="{card.top}px"
				style:width="{card.width}px"
				style:height="{card.height}px"
			>
				<button
					class="card"
					style:--accent={card.accent}
					onclick={() => onSelect(card.id)}
					title={card.name}
				>
					<span class="name">{card.name}</span>
				</button>
			</div>
		{/each}
	</div>
</div>

<style>
	.tree-scroll {
		overflow: auto;
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		background: var(--sa-surface);
		max-height: 78vh;
	}

	.tree-canvas {
		position: relative;
		margin: 0 auto;
	}

	.connectors {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}

	.connectors line {
		stroke: var(--sa-border);
		stroke-width: 2;
		stroke-linecap: square;
	}

	/* The slot is larger than the card; the padding is the gap between cards. */
	.node {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 22px 20px;
		box-sizing: border-box;
	}

	.card {
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
		transition:
			transform 0.08s ease,
			border-color 0.08s ease;
	}

	.card:hover {
		transform: translateY(-1px);
		border-color: var(--accent, var(--sa-border));
	}

	.node.root .card {
		outline: 2px solid var(--accent, var(--sa-border));
		outline-offset: 1px;
	}

	.card .name {
		font-weight: 600;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
</style>
