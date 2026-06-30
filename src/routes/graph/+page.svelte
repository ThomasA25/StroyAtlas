<script lang="ts">
	import type cytoscape from 'cytoscape';
	import { onMount, untrack } from 'svelte';
	import { store } from '$lib/core/store.svelte';
	import { clock } from '$lib/core/clock.svelte';
	import { characterRelationships } from '$lib/core/relationships';
	import { activeCharactersAt } from '$lib/core/playback';
	import type { CharacterId } from '$lib/core/ids';
	import { t } from '$lib/i18n/i18n.svelte';
	import PlayerControls from '$lib/ui/PlayerControls.svelte';

	// Skull overlaid on a character's node once they have died at the current time.
	const SKULL =
		'data:image/svg+xml,' +
		encodeURIComponent(
			"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#ececed' d='M12 3C7.6 3 4 6.1 4 10c0 2.5 1.5 4.3 3 5.3V17a1.4 1.4 0 0 0 1.4 1.4H9V17h1.3v1.4h3.4V17H15v1.4h.6A1.4 1.4 0 0 0 17 17v-1.7c1.5-1 3-2.8 3-5.3 0-3.9-3.6-7-8-7z'/><circle cx='9' cy='10.6' r='2' fill='#23232a'/><circle cx='15' cy='10.6' r='2' fill='#23232a'/><path d='M12 13l-1.2 2.3h2.4z' fill='#23232a'/></svg>"
		);

	let el: HTMLDivElement;
	let cy: cytoscape.Core | null = null;
	let ready = $state(false);

	// Controls
	let minWeight = $state(2); // hide weak (single co-occurrence) links by default
	let hideIsolated = $state(true);
	let focusId = $state<string | null>(null);

	// Semantic faction colours (work across locales); stable hash fallback otherwise.
	const FACTION_COLORS: Record<string, string> = {
		greens: '#4caf50',
		grüne: '#4caf50',
		blacks: '#c0413a',
		schwarze: '#c0413a',
		neutral: '#9098a6'
	};
	function colorFor(faction: string | null | undefined): string {
		if (!faction) return FACTION_COLORS.neutral;
		const key = faction.toLowerCase();
		if (FACTION_COLORS[key]) return FACTION_COLORS[key];
		let h = 0;
		for (const ch of faction) h = (h * 31 + ch.charCodeAt(0)) % 360;
		return `hsl(${h} 55% 55%)`;
	}

	const maxWeight = $derived(
		Math.max(1, ...characterRelationships(store.project).map((l) => l.weight))
	);
	const factions = $derived([
		...new Set(Object.values(store.project.characters).map((c) => c.faction || 'Neutral'))
	]);

	function buildElements(): cytoscape.ElementDefinition[] {
		const characters = Object.values(store.project.characters);
		const rels = characterRelationships(store.project);

		// Weighted degree drives node size, so central characters read as bigger.
		const degree = new Map<string, number>();
		for (const l of rels) {
			degree.set(l.a, (degree.get(l.a) ?? 0) + l.weight);
			degree.set(l.b, (degree.get(l.b) ?? 0) + l.weight);
		}
		const maxDeg = Math.max(1, ...degree.values());
		const sizeFor = (id: string) => 16 + Math.round(((degree.get(id) ?? 0) / maxDeg) * 38);

		const nodes: cytoscape.ElementDefinition[] = characters.map((c) => ({
			data: {
				id: c.id,
				label: c.name,
				color: colorFor(c.faction),
				size: sizeFor(c.id)
			}
		}));
		const edges: cytoscape.ElementDefinition[] = rels.map((l, i) => ({
			data: { id: `link-${i}`, source: l.a, target: l.b, weight: l.weight }
		}));
		return [...nodes, ...edges];
	}

	function runLayout(): void {
		if (!cy) return;
		const opts = {
			name: 'cose',
			animate: false,
			nodeDimensionsIncludeLabels: true,
			// Strong links pull characters together; weak links barely tug.
			idealEdgeLength: (e: cytoscape.EdgeSingular) => 150 / Math.sqrt(e.data('weight') || 1),
			edgeElasticity: (e: cytoscape.EdgeSingular) => 40 * (e.data('weight') || 1),
			nodeRepulsion: () => 14000,
			gravity: 0.25,
			componentSpacing: 120,
			padding: 24,
			randomize: true
		} as unknown as cytoscape.LayoutOptions;
		cy.layout(opts).run();
	}

	// Hide links below the threshold and (optionally) the nodes left unconnected.
	function applyFilter(): void {
		if (!cy) return;
		const eff = Math.min(minWeight, maxWeight);
		cy.batch(() => {
			cy!.edges().forEach((e) => {
				e.toggleClass('hidden', (e.data('weight') ?? 0) < eff);
			});
			cy!.nodes().forEach((n) => {
				const connected = n.connectedEdges().not('.hidden').length > 0;
				n.toggleClass('hidden', hideIsolated && !connected);
			});
		});
	}

	// Focus a character: keep it + its neighbours bright, fade the rest.
	function applyFocus(): void {
		if (!cy) return;
		cy.batch(() => {
			cy!.elements().removeClass('faded focus');
			if (!focusId) return;
			const node = cy!.getElementById(focusId);
			if (node.empty()) return;
			cy!.elements().not(node.closedNeighborhood()).addClass('faded');
			node.addClass('focus');
		});
	}

	function applyActive(): void {
		if (!cy) return;
		const active = activeCharactersAt(store.project, clock.current);
		cy.batch(() => {
			cy!.nodes().removeClass('active');
			for (const id of active) cy!.getElementById(id as string).addClass('active');
		});
	}

	// Mark characters who have died by the current timeline position as dead.
	function applyDeaths(): void {
		if (!cy) return;
		const deaths = store.characterDeaths;
		const ti = Math.round(clock.current);
		cy.batch(() => {
			cy!.nodes().forEach((n) => {
				const d = deaths.get(n.id() as CharacterId);
				n.toggleClass('dead', !!d && ti >= d.orderIndex);
			});
		});
	}

	onMount(() => {
		let destroyed = false;
		void (async () => {
			const cytoscapeLib = (await import('cytoscape')).default;
			if (destroyed) return;
			cy = cytoscapeLib({
				container: el,
				wheelSensitivity: 0.2,
				style: [
					{
						selector: 'node',
						style: {
							'background-color': 'data(color)',
							label: 'data(label)',
							color: '#e9e9f0',
							'font-size': 'mapData(size, 16, 54, 8, 15)',
							'text-outline-color': '#0d0d13',
							'text-outline-width': 2,
							'min-zoomed-font-size': 8,
							'text-wrap': 'wrap',
							'text-max-width': '100px',
							width: 'data(size)',
							height: 'data(size)',
							'border-width': 0,
							'transition-property': 'opacity',
							'transition-duration': 150
						}
					},
					{
						selector: 'edge',
						style: {
							width: 'mapData(weight, 1, 10, 1, 7)',
							'line-color': '#41414f',
							'curve-style': 'straight',
							opacity: 0.5
						}
					},
					{ selector: 'node.active', style: { 'border-width': 4, 'border-color': '#e6c34a' } },
					{ selector: 'node.focus', style: { 'border-width': 3, 'border-color': '#ffffff' } },
					{
						selector: 'node.dead',
						style: {
							'background-color': '#54545d',
							'background-image': SKULL,
							'background-fit': 'contain',
							'border-width': 0,
							opacity: 0.6
						}
					},
					{ selector: '.faded', style: { opacity: 0.07, 'text-opacity': 0.07 } },
					{ selector: '.hidden', style: { display: 'none' } }
				]
			});
			cy.on('tap', 'node', (e) => (focusId = e.target.id()));
			cy.on('tap', (e) => {
				if (e.target === cy) focusId = null;
			});
			ready = true;
		})();
		return () => {
			destroyed = true;
			cy?.destroy();
			cy = null;
		};
	});

	// Rebuild + lay out when the underlying characters/relationships change. The
	// reapply calls are untracked so this does NOT re-run on clock/filter/focus.
	$effect(() => {
		if (!ready || !cy) return;
		const elements = buildElements();
		cy.elements().remove();
		cy.add(elements);
		runLayout();
		untrack(() => {
			applyFilter();
			applyActive();
			applyFocus();
			applyDeaths();
		});
	});

	// Lightweight class-toggle effects (no re-layout).
	$effect(() => {
		void minWeight;
		void hideIsolated;
		if (ready && cy) applyFilter();
	});
	$effect(() => {
		void focusId;
		if (ready && cy) applyFocus();
	});
	$effect(() => {
		void clock.current;
		if (ready && cy) applyActive();
	});
	$effect(() => {
		void clock.current;
		void store.characterDeaths;
		if (ready && cy) applyDeaths();
	});

	const empty = $derived(Object.keys(store.project.characters).length === 0);
</script>

<h1>{t('graph.title')}</h1>
<PlayerControls />

<div class="controls sa-card">
	<label class="slider">
		{t('graph.minStrength')}
		<input type="range" min="1" max={maxWeight} step="1" bind:value={minWeight} />
		<span class="val">≥ {Math.min(minWeight, maxWeight)}</span>
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={hideIsolated} />
		{t('graph.hideIsolated')}
	</label>
	<button onclick={runLayout}>{t('graph.relayout')}</button>
	<div class="legend">
		<span class="legend-title sa-muted">{t('graph.legend')}:</span>
		{#each factions as f (f)}
			<span class="chip"><span class="dot" style:background={colorFor(f)}></span>{f}</span>
		{/each}
	</div>
</div>

<div class="graph-wrap sa-card">
	<div class="graph" bind:this={el}></div>
	{#if empty}
		<p class="hint sa-muted">{t('graph.empty')}</p>
	{:else}
		<p class="focus-hint sa-muted">{t('graph.focusHint')}</p>
	{/if}
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.6rem 0.75rem;
	}
	.slider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--sa-text-dim);
	}
	.slider input {
		width: 140px;
	}
	.slider .val {
		font-variant-numeric: tabular-nums;
		min-width: 2.2rem;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: var(--sa-text-dim);
	}
	.check input {
		width: auto;
	}
	.controls button {
		font-size: 0.85rem;
		padding: 0.3rem 0.7rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.8rem;
	}
	.legend .chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.legend .dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		display: inline-block;
	}
	.graph-wrap {
		position: relative;
		padding: 0;
		overflow: hidden;
	}
	.graph {
		height: 72vh;
		width: 100%;
		background: #0d0d13;
	}
	.hint {
		position: absolute;
		top: 1rem;
		left: 1rem;
	}
	.focus-hint {
		position: absolute;
		bottom: 0.6rem;
		left: 0.75rem;
		font-size: 0.78rem;
		pointer-events: none;
		opacity: 0.7;
	}
</style>
