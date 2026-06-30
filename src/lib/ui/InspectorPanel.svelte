<script lang="ts">
	import { store } from '$lib/core/store.svelte';
	import type { LocationId } from '$lib/core/ids';
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Origin } from '$lib/core/model';
	import type { LocationType } from '$lib/core/contract';

	const originLabel = (o: Origin) => t(`origin.${o}`);
	const locTypeLabel = (ty: LocationType) => t(`locType.${ty}`);

	function toggle<T>(arr: T[], value: T) {
		const i = arr.indexOf(value);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(value);
	}
	function parseAliases(s: string): string[] {
		return s
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);
	}
	function pickLocation(target: { locationId: LocationId | null }, value: string) {
		target.locationId = (value || null) as LocationId | null;
	}

	const characters = $derived(Object.values(store.project.characters));
	const locations = $derived(Object.values(store.project.locations));
	const events = $derived(Object.values(store.project.events));
	const scenes = $derived(Object.values(store.project.scenes));
</script>

<section class="sa-card">
	<h3>{t('inspector.story')}</h3>
	<div class="grid4">
		<label>{t('inspector.series')}<input bind:value={store.project.meta.series} /></label>
		<label>{t('inspector.title')}<input bind:value={store.project.meta.title} /></label>
		<label>{t('inspector.season')}<input type="number" bind:value={store.project.meta.season} /></label>
		<label>{t('inspector.episode')}<input type="number" bind:value={store.project.meta.episode} /></label>
	</div>
</section>

<!-- Characters -->
<details class="sa-card" open>
	<summary><h3>{t('inspector.characters')} ({characters.length})</h3></summary>
	{#each characters as c (c.id)}
		{@const death = store.characterDeaths.get(c.id)}
		<div class="entity">
			<div class="grid3">
				<label>{t('inspector.name')}<input bind:value={c.name} /></label>
				<label
					>{t('inspector.faction')}<input
						value={c.faction ?? ''}
						oninput={(e) => (c.faction = e.currentTarget.value || null)}
					/></label
				>
				<label
					>{t('inspector.aliases')}<input
						value={c.aliases.join(', ')}
						oninput={(e) => (c.aliases = parseAliases(e.currentTarget.value))}
					/></label
				>
			</div>
			<div class="rowend">
				{#if death}
					<span
						class="sa-badge death"
						title={t('death.diesIn', {
							event: store.project.events[death.eventId]?.title ?? ''
						})}>💀 {t('death.died')}</span
					>
				{/if}
				<span class="sa-badge" class:extracted={c.origin === 'extracted'}>{originLabel(c.origin)}</span>
				<button class="danger" onclick={() => store.removeCharacter(c.id)}>{t('common.delete')}</button>
			</div>
		</div>
	{/each}
	<button onclick={() => store.createCharacter()}>{t('inspector.addCharacter')}</button>
</details>

<!-- Locations -->
<details class="sa-card" open>
	<summary><h3>{t('inspector.locations')} ({locations.length})</h3></summary>
	{#each locations as l (l.id)}
		<div class="entity">
			<div class="grid4">
				<label>{t('inspector.name')}<input bind:value={l.name} /></label>
				<label
					>{t('inspector.type')}<select
						value={l.type}
						onchange={(e) => (l.type = e.currentTarget.value as typeof l.type)}
					>
						<option value="city">{locTypeLabel('city')}</option>
						<option value="castle">{locTypeLabel('castle')}</option>
						<option value="region">{locTypeLabel('region')}</option>
						<option value="sea">{locTypeLabel('sea')}</option>
						<option value="other">{locTypeLabel('other')}</option>
					</select></label
				>
				<label>x<input type="number" bind:value={l.coordinates.x} /></label>
				<label>y<input type="number" bind:value={l.coordinates.y} /></label>
			</div>
			<div class="rowend">
				<span class="sa-badge" class:extracted={l.origin === 'extracted'}>{originLabel(l.origin)}</span>
				<button class="danger" onclick={() => store.removeLocation(l.id)}>{t('common.delete')}</button>
			</div>
		</div>
	{/each}
	<button onclick={() => store.createLocation()}>{t('inspector.addLocation')}</button>
</details>

<!-- Events -->
<details class="sa-card">
	<summary><h3>{t('inspector.events')} ({events.length})</h3></summary>
	{#each events as ev (ev.id)}
		<div class="entity">
			<div class="grid3">
				<label>{t('inspector.title')}<input bind:value={ev.title} /></label>
				<label>{t('inspector.order')}<input type="number" bind:value={ev.orderIndex} /></label>
				<label
					>{t('inspector.location')}<select
						value={ev.locationId ?? ''}
						onchange={(e) => pickLocation(ev, e.currentTarget.value)}
					>
						<option value="">{t('inspector.noneOption')}</option>
						{#each locations as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
					</select></label
				>
			</div>
			<label>{t('inspector.summary')}<textarea rows="2" bind:value={ev.summary}></textarea></label>
			<fieldset>
				<legend class="sa-muted">{t('inspector.charactersInvolved')}</legend>
				{#each characters as c (c.id)}
					<label class="chip"
						><input
							type="checkbox"
							checked={ev.charactersInvolved.includes(c.id)}
							onchange={() => toggle(ev.charactersInvolved, c.id)}
						/>{c.name}</label
					>
				{/each}
			</fieldset>
			<div class="rowend">
				<span class="sa-badge" class:extracted={ev.origin === 'extracted'}>{originLabel(ev.origin)}</span>
				<button class="danger" onclick={() => store.removeEvent(ev.id)}>{t('common.delete')}</button>
			</div>
		</div>
	{/each}
	<button onclick={() => store.createEvent()}>{t('inspector.addEvent')}</button>
</details>

<!-- Scenes -->
<details class="sa-card">
	<summary><h3>{t('inspector.scenes')} ({scenes.length})</h3></summary>
	{#each scenes as sc (sc.id)}
		<div class="entity">
			<div class="grid4">
				<label>{t('inspector.startHint')}<input bind:value={sc.startHint} /></label>
				<label>{t('inspector.endHint')}<input bind:value={sc.endHint} /></label>
				<label>{t('inspector.order')}<input type="number" bind:value={sc.orderIndex} /></label>
				<label
					>{t('inspector.location')}<select
						value={sc.locationId ?? ''}
						onchange={(e) => pickLocation(sc, e.currentTarget.value)}
					>
						<option value="">{t('inspector.noneOption')}</option>
						{#each locations as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
					</select></label
				>
			</div>
			<label>{t('inspector.transitionToNext')}<input bind:value={sc.transitionToNext} /></label>
			<fieldset>
				<legend class="sa-muted">{t('inspector.charactersPresent')}</legend>
				{#each characters as c (c.id)}
					<label class="chip"
						><input
							type="checkbox"
							checked={sc.characters.includes(c.id)}
							onchange={() => toggle(sc.characters, c.id)}
						/>{c.name}</label
					>
				{/each}
			</fieldset>
			<fieldset>
				<legend class="sa-muted">{t('inspector.events')}</legend>
				{#each events as ev (ev.id)}
					<label class="chip"
						><input
							type="checkbox"
							checked={sc.eventIds.includes(ev.id)}
							onchange={() => toggle(sc.eventIds, ev.id)}
						/>{ev.title}</label
					>
				{/each}
			</fieldset>
			<div class="rowend">
				<span class="sa-badge" class:extracted={sc.origin === 'extracted'}>{originLabel(sc.origin)}</span>
				<button class="danger" onclick={() => store.removeScene(sc.id)}>{t('common.delete')}</button>
			</div>
		</div>
	{/each}
	<button onclick={() => store.createScene()}>{t('inspector.addScene')}</button>
</details>

<style>
	details {
		margin-bottom: 0.75rem;
	}
	summary {
		cursor: pointer;
		list-style: none;
	}
	summary h3 {
		display: inline;
	}
	.entity {
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		padding: 0.6rem;
		margin: 0.6rem 0;
		background: var(--sa-surface-2);
	}
	.grid3,
	.grid4 {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	.grid3 {
		grid-template-columns: repeat(3, 1fr);
	}
	.grid4 {
		grid-template-columns: repeat(4, 1fr);
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.8rem;
		color: var(--sa-text-dim);
		gap: 0.2rem;
	}
	fieldset {
		border: 1px solid var(--sa-border);
		border-radius: var(--sa-radius);
		margin: 0.4rem 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.chip {
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
		color: var(--sa-text);
		font-size: 0.85rem;
	}
	.chip input {
		width: auto;
	}
	.rowend {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
	}
	.sa-badge.death {
		color: var(--sa-danger);
		border-color: var(--sa-danger);
	}
</style>
