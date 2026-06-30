<script lang="ts">
	import type { Snippet } from 'svelte';
	import { layout, ROW_UNIT, MIN_ROWS, MAX_ROWS } from '$lib/core/layout.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	// Generic dashboard of reorderable, resizable panels in a two-column grid. Per
	// panel: drag the ⠿ handle to reorder, toggle full/half width to place panels
	// side by side, and drag the bottom edge to resize the height — which snaps to
	// a fixed row grid. Each panel's content scrolls within its grid-snapped
	// height. Order/width/height persist per `board`.
	let {
		board,
		items,
		widget,
		resettable = true
	}: {
		board: string;
		items: { id: string; label?: string; rows?: number }[];
		widget: Snippet<[string]>;
		resettable?: boolean;
	} = $props();

	const ids = $derived(layout.ordered(board, items.map((i) => i.id)));
	const itemOf = (id: string) => items.find((i) => i.id === id);
	const clampRows = (n: number) => Math.max(MIN_ROWS, Math.min(MAX_ROWS, n));

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let overAfter = $state(false);

	// Live height-resize state (snaps to whole rows; committed on pointer up).
	let resizing = $state<{ id: string; startY: number; startRows: number; rows: number } | null>(
		null
	);

	function reorder(targetId: string, after: boolean): void {
		if (!dragId || dragId === targetId) return;
		const arr = ids.filter((x) => x !== dragId);
		let idx = arr.indexOf(targetId);
		if (idx < 0) return;
		if (after) idx += 1;
		arr.splice(idx, 0, dragId);
		layout.setOrder(board, arr);
	}

	function clear(): void {
		dragId = null;
		overId = null;
	}

	function isAfter(e: DragEvent, el: HTMLElement): boolean {
		const rect = el.getBoundingClientRect();
		return e.clientY - rect.top > rect.height / 2;
	}

	function startResize(e: PointerEvent, id: string, currentRows: number): void {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		resizing = { id, startY: e.clientY, startRows: currentRows, rows: currentRows };
	}
	function moveResize(e: PointerEvent, id: string): void {
		if (!resizing || resizing.id !== id) return;
		const steps = Math.round((e.clientY - resizing.startY) / ROW_UNIT);
		const next = clampRows(resizing.startRows + steps);
		if (next !== resizing.rows) resizing = { ...resizing, rows: next };
	}
	function endResize(id: string): void {
		if (!resizing || resizing.id !== id) return;
		layout.setRows(board, id, resizing.rows);
		resizing = null;
	}
</script>

<div class="board">
	{#each ids as id (id)}
		{@const half = layout.spanOf(board, id) === 'half'}
		{@const rows = layout.rowsOf(board, id, itemOf(id)?.rows ?? 4)}
		{@const liveRows = resizing && resizing.id === id ? resizing.rows : rows}
		<div
			class="item"
			class:half
			class:dragging={dragId === id}
			class:resizing={resizing?.id === id}
			class:over-top={overId === id && !overAfter}
			class:over-bottom={overId === id && overAfter}
			style="height: {liveRows * ROW_UNIT}px"
			role="group"
			ondragover={(e) => {
				if (!dragId || id === dragId) return;
				e.preventDefault();
				overId = id;
				overAfter = isAfter(e, e.currentTarget);
			}}
			ondragleave={() => {
				if (overId === id) overId = null;
			}}
			ondrop={(e) => {
				e.preventDefault();
				reorder(id, isAfter(e, e.currentTarget));
				clear();
			}}
		>
			<div class="db-controls">
				<button
					class="db-btn"
					type="button"
					aria-label={half ? t('layout.fullWidth') : t('layout.halfWidth')}
					title={half ? t('layout.fullWidth') : t('layout.halfWidth')}
					onclick={() => layout.setSpan(board, id, half ? 'full' : 'half')}>{half ? '▭' : '◧'}</button
				>
				<button
					class="db-btn handle"
					type="button"
					aria-label={t('layout.dragHint')}
					title={itemOf(id)?.label ?? id}
					draggable="true"
					ondragstart={(e) => {
						dragId = id;
						const card = (e.currentTarget as HTMLElement).closest('.item');
						if (e.dataTransfer && card) {
							e.dataTransfer.effectAllowed = 'move';
							e.dataTransfer.setDragImage(card, 16, 16);
						}
					}}
					ondragend={clear}>⠿</button
				>
			</div>
			<div class="db-scroll">
				{@render widget(id)}
			</div>
			<div
				class="db-resize"
				role="slider"
				tabindex="0"
				aria-label={t('layout.resizeHint')}
				title={t('layout.resizeHint')}
				aria-valuenow={liveRows}
				aria-valuemin={MIN_ROWS}
				aria-valuemax={MAX_ROWS}
				onpointerdown={(e) => startResize(e, id, rows)}
				onpointermove={(e) => moveResize(e, id)}
				onpointerup={() => endResize(id)}
				onkeydown={(e) => {
					if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
						e.preventDefault();
						layout.setRows(board, id, rows + 1);
					} else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
						e.preventDefault();
						layout.setRows(board, id, rows - 1);
					}
				}}
			></div>
		</div>
	{/each}
</div>
{#if resettable && layout.isCustom(board)}
	<button class="reset" onclick={() => layout.reset(board)}>{t('layout.reset')}</button>
{/if}

<style>
	.board {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: min-content;
		gap: 1rem;
		align-items: start;
	}
	.item {
		position: relative;
		grid-column: 1 / -1; /* full width by default */
		min-width: 0;
		overflow: hidden;
		border-radius: var(--sa-radius);
	}
	.item.half {
		grid-column: span 1;
	}
	.item.dragging {
		opacity: 0.5;
	}
	.item.resizing {
		user-select: none;
	}
	/* insertion indicator (inset so it isn't clipped by overflow:hidden) */
	.item.over-top {
		box-shadow: inset 0 3px 0 var(--sa-accent);
	}
	.item.over-bottom {
		box-shadow: inset 0 -3px 0 var(--sa-accent);
	}
	.db-scroll {
		height: 100%;
		overflow: auto;
	}
	.db-controls {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		z-index: 5;
		display: flex;
		gap: 0.25rem;
	}
	.db-btn {
		cursor: pointer;
		width: auto;
		min-width: 1.4rem;
		padding: 0.05rem 0.35rem;
		font-size: 0.9rem;
		line-height: 1.3;
		text-align: center;
		color: var(--sa-text-dim);
		background: var(--sa-surface-2);
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		opacity: 0.55;
	}
	.db-btn:hover {
		opacity: 1;
		color: var(--sa-accent);
		border-color: var(--sa-accent);
	}
	.handle {
		cursor: grab;
	}
	.handle:active {
		cursor: grabbing;
	}
	.db-resize {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 10px;
		cursor: ns-resize;
		z-index: 5;
		touch-action: none;
	}
	.db-resize::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		transform: translateX(-50%);
		width: 32px;
		height: 3px;
		border-radius: 3px;
		background: var(--sa-border);
		transition: background-color 0.15s;
	}
	.db-resize:hover::after,
	.db-resize:focus-visible::after {
		background: var(--sa-accent);
	}
	.reset {
		margin-top: 0.75rem;
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
	}
	@media (max-width: 720px) {
		.board {
			grid-template-columns: 1fr;
		}
		.item.half {
			grid-column: 1 / -1;
		}
	}
</style>
