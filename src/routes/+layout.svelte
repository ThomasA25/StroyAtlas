<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { store } from '$lib/core/store.svelte';
	import { DexieProjectRepository } from '$lib/core/persistence';
	import { hotdDefaultProject, isHotdDefault } from '$lib/core/hotd-default';
	import { isProjectEmpty, type Project } from '$lib/core/model';
	import { i18n, t } from '$lib/i18n/i18n.svelte';
	import { LOCALES, type Locale } from '$lib/i18n/messages';
	import { EDIT_MODE } from '$lib/core/env';

	let { children } = $props();

	const repo = browser ? new DexieProjectRepository() : null;
	let loaded = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(async () => {
		// Seed the House of the Dragon dataset (in the active language) whenever
		// there is no saved project with actual content, or when the saved one is
		// still the untouched auto-seeded default. Real user work is preserved.
		const existing = repo ? await repo.load() : null;
		const useDefault = !existing || isProjectEmpty(existing) || isHotdDefault(existing);
		store.load(useDefault ? hotdDefaultProject(i18n.locale) : existing);
		loaded = true;
	});

	function changeLocale(locale: Locale): void {
		i18n.setLocale(locale);
		// Swap the seed dataset to the new language while it is still the default.
		if (isProjectEmpty(store.project) || isHotdDefault(store.project)) {
			store.load(hotdDefaultProject(locale));
		}
	}

	// Debounced autosave: snapshot() both reads the project deeply (so this effect
	// re-runs on any nested change) and yields a plain object to persist.
	$effect(() => {
		const data = $state.snapshot(store.project) as Project;
		if (!loaded || !repo) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void repo.save(data), 500);
	});

	// The editor route is authoring-only, so it is shown only when running locally.
	const nav = $derived([
		...(EDIT_MODE ? [{ href: '/', label: t('nav.editor') }] : []),
		{ href: '/map', label: t('nav.mapTimeline') },
		...(EDIT_MODE ? [{ href: '/editor', label: t('nav.mapEditor') }] : [])
	]);
</script>

<div class="shell">
	<header>
		<div class="row-top">
			<span class="brand">🗺️ StoryAtlas</span>
			<span class="meta sa-muted">{store.project.meta.title || store.project.meta.series || ''}</span>
			<select
				class="lang"
				aria-label={t('language.label')}
				value={i18n.locale}
				onchange={(e) => changeLocale(e.currentTarget.value as Locale)}
			>
				{#each LOCALES as l (l.code)}<option value={l.code}>{l.label}</option>{/each}
			</select>
		</div>
		<nav>
			{#each nav as item (item.href)}
				<a href={item.href} class:active={page.url.pathname === item.href}>{item.label}</a>
			{/each}
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		background: var(--sa-surface);
		border-bottom: 1px solid var(--sa-border);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.row-top {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.brand {
		font-family: var(--sa-font-display);
		font-size: 1.15rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.meta {
		margin-left: auto;
		font-style: italic;
		font-size: 0.85rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lang {
		width: auto;
		flex-shrink: 0;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	nav::-webkit-scrollbar {
		display: none;
	}
	nav a {
		flex: 1 1 auto;
		padding: 0.35rem 0.7rem;
		border-radius: var(--sa-radius);
		text-decoration: none;
		text-align: center;
		white-space: nowrap;
		color: var(--sa-text-dim);
	}
	nav a.active {
		background: var(--sa-surface-2);
		color: var(--sa-text);
	}
	main {
		flex: 1;
		padding: 1rem;
		max-width: 1100px;
		width: 100%;
		margin: 0 auto;
	}

	@media (max-width: 480px) {
		.meta {
			display: none;
		}
	}
</style>
