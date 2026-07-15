<script lang="ts">
	import calcTree from 'relatives-tree';
	import type { Node as RelNode } from 'relatives-tree/lib/types';
	import { store } from '$lib/core/store.svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import { factionAt } from '$lib/core/derive';
	import { factionColor } from '$lib/ui/faction-color';
	import type { CharacterId } from '$lib/core/ids';
	import type { Character } from '$lib/core/model';

	// A relatives-tree layout is expressed in grid units where each node occupies
	// SIZE (=2) units, so one unit maps to half a card slot. Generous slot sizes +
	// inset padding give the cards plenty of breathing room between generations.
	const SLOT_W = 184;
	const SLOT_H = 168;
	const UX = SLOT_W / 2;
	const UY = SLOT_H / 2;

	// derive.familyTree is library-free (plain string relation types); the cast to
	// relatives-tree's Node happens only at the calcTree boundary.
	const treeNodes = $derived(store.familyTree);
	const memberIds = $derived(new Set(treeNodes.map((n) => n.id as string)));

	const character = (id: string): Character | undefined =>
		store.project.characters[id as CharacterId];
	const nameOf = (id: string) => character(id)?.name ?? id;

	// House of a character: explicit `house`, else the surname parsed from the name
	// (the trailing "of X", else the last token). Mirrors the map view's fallback.
	function houseOf(name: string): string {
		const of = name.match(/\bof\s+(.+)$/i);
		if (of) return of[1].trim();
		const parts = name.trim().split(/\s+/);
		return parts.length > 1 ? parts[parts.length - 1] : '';
	}
	const houseFor = (id: string): string => {
		const c = character(id);
		return c?.house ?? (c ? houseOf(c.name) : '');
	};

	// Families present in the tree, largest first — the options for the picker.
	const families = $derived.by(() => {
		const byHouse = new Map<string, string[]>();
		for (const n of treeNodes) {
			const h = houseFor(n.id as string);
			if (!h) continue;
			if (!byHouse.has(h)) byHouse.set(h, []);
			byHouse.get(h)!.push(n.id as string);
		}
		return [...byHouse.entries()]
			.map(([house, ids]) => ({ house, ids }))
			.sort((a, b) => b.ids.length - a.ids.length || a.house.localeCompare(b.house));
	});

	// Selected family; defaults to the largest and re-validates on data changes.
	let selectedHouse = $state('');
	$effect(() => {
		if (selectedHouse && families.some((f) => f.house === selectedHouse)) return;
		selectedHouse = families[0]?.house ?? '';
	});

	// Child adjacency + "has a parent in the tree" flags, for root selection.
	const childrenMap = $derived(
		new Map(treeNodes.map((n) => [n.id as string, n.children.map((c) => c.id as string)]))
	);
	const hasParent = $derived(
		new Map(treeNodes.map((n) => [n.id as string, n.parents.length > 0]))
	);

	function descendantCount(id: string): number {
		const seen = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const kid of childrenMap.get(cur) ?? []) {
				if (!seen.has(kid)) {
					seen.add(kid);
					stack.push(kid);
				}
			}
		}
		return seen.size;
	}

	// Root for a family: prefer a house founder (no parent in the tree) with the
	// most descendants, so the whole dynasty hangs beneath the eldest ancestor.
	function pickRoot(ids: string[]): string {
		let best = ids[0] ?? '';
		let bestScore = -1;
		for (const id of ids) {
			const founderBonus = hasParent.get(id) ? 0 : 1_000_000;
			const score = founderBonus + descendantCount(id);
			if (score > bestScore) {
				bestScore = score;
				best = id;
			}
		}
		return best;
	}

	const rootId = $derived.by(() => {
		const family = families.find((f) => f.house === selectedHouse) ?? families[0];
		return family ? pickRoot(family.ids) : '';
	});

	// relatives-tree can throw on degenerate graphs; never let that blank the page.
	const layout = $derived.by(() => {
		if (!rootId || !memberIds.has(rootId) || treeNodes.length === 0) return null;
		try {
			return calcTree(treeNodes as unknown as RelNode[], { rootId, placeholders: false });
		} catch (err) {
			console.error('family tree layout failed', err);
			return null;
		}
	});

	// Colour a card by the character's final allegiance (end of the timeline).
	const accentOf = (id: string) => {
		const c = character(id);
		return c ? factionColor(factionAt(c, Number.MAX_SAFE_INTEGER)) : factionColor(null);
	};

	// ── Profile modal ─────────────────────────────────────────────────────────
	let selectedId = $state<string | null>(null);
	const selectedChar = $derived(selectedId ? character(selectedId) : undefined);

	function openProfile(id: string): void {
		selectedId = id;
	}
	function closeProfile(): void {
		selectedId = null;
	}
	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') closeProfile();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="head">
	<h1>{t('tree.title')}</h1>
	{#if families.length}
		<label class="family-pick">
			<span class="sa-muted">{t('tree.family')}</span>
			<select bind:value={selectedHouse}>
				{#each families as f (f.house)}
					<option value={f.house}>{f.house} ({f.ids.length})</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if layout}
	<div class="tree-scroll">
		<div
			class="tree-canvas"
			style:width="{layout.canvas.width * UX}px"
			style:height="{layout.canvas.height * UY}px"
		>
			<svg
				class="connectors"
				width={layout.canvas.width * UX}
				height={layout.canvas.height * UY}
				aria-hidden="true"
			>
				{#each layout.connectors as c, i (i)}
					<line x1={c[0] * UX} y1={c[1] * UY} x2={c[2] * UX} y2={c[3] * UY} />
				{/each}
			</svg>
			<!-- A character can legitimately appear at several positions (e.g. Aegon II
			     as both Viserys' son and Helaena's husband), so the id alone is not a
			     unique key — pair it with the grid position. -->
			{#each layout.nodes as node (`${node.id}@${node.left},${node.top}`)}
				<div
					class="node"
					class:root={node.id === rootId}
					style:left="{node.left * UX}px"
					style:top="{node.top * UY}px"
					style:width="{SLOT_W}px"
					style:height="{SLOT_H}px"
				>
					<button
						class="card"
						style:--accent={accentOf(node.id)}
						onclick={() => openProfile(node.id)}
						title={nameOf(node.id)}
					>
						<span class="name">{nameOf(node.id)}</span>
					</button>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<p class="sa-muted empty">{t('tree.empty')}</p>
{/if}

{#if selectedChar}
	<div
		class="modal-backdrop"
		role="button"
		tabindex="-1"
		aria-label={t('common.close')}
		onclick={closeProfile}
		onkeydown={(e) => e.key === 'Enter' && closeProfile()}
	>
		<div
			class="modal sa-card"
			role="dialog"
			aria-modal="true"
			aria-label={selectedChar.name}
			style:--accent={accentOf(selectedChar.id)}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			tabindex="-1"
		>
			<button class="modal-close" onclick={closeProfile} aria-label={t('common.close')}>×</button>
			<div class="avatar" aria-hidden="true">{selectedChar.name.charAt(0)}</div>
			<h2>{selectedChar.name}</h2>
			<dl class="facts">
				{#if houseFor(selectedChar.id)}
					<dt>{t('inspector.house')}</dt>
					<dd>{houseFor(selectedChar.id)}</dd>
				{/if}
				{#if factionAt(selectedChar, Number.MAX_SAFE_INTEGER)}
					<dt>{t('inspector.faction')}</dt>
					<dd>{factionAt(selectedChar, Number.MAX_SAFE_INTEGER)}</dd>
				{/if}
				{#if selectedChar.aliases.length}
					<dt>{t('tree.aliases')}</dt>
					<dd>{selectedChar.aliases.join(', ')}</dd>
				{/if}
			</dl>
			<p class="soon sa-muted">{t('tree.profileSoon')}</p>
		</div>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	.family-pick {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.family-pick select {
		width: auto;
	}

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

	.empty {
		padding: 2rem 0;
		text-align: center;
	}

	/* ── Profile modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: color-mix(in srgb, #000 55%, transparent);
	}

	.modal {
		position: relative;
		width: min(360px, 100%);
		padding: 1.5rem;
		text-align: center;
		border-top: 4px solid var(--accent, var(--sa-border));
	}

	.modal-close {
		position: absolute;
		top: 0.4rem;
		right: 0.5rem;
		width: auto;
		padding: 0.1rem 0.5rem;
		font-size: 1.2rem;
		line-height: 1;
		background: transparent;
		border: none;
		color: var(--sa-text-dim);
		cursor: pointer;
	}

	.avatar {
		width: 72px;
		height: 72px;
		margin: 0 auto 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--sa-surface-2);
		border: 2px solid var(--accent, var(--sa-border));
		font-family: var(--sa-font-display);
		font-size: 1.8rem;
		font-weight: 600;
	}

	.modal h2 {
		margin: 0 0 0.75rem;
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 0.75rem;
		margin: 0 0 0.9rem;
		text-align: left;
		font-size: 0.88rem;
	}

	.facts dt {
		color: var(--sa-text-dim);
		white-space: nowrap;
	}

	.facts dd {
		margin: 0;
	}

	.soon {
		margin: 0;
		font-size: 0.82rem;
		font-style: italic;
	}
</style>
