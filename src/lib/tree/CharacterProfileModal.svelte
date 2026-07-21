<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { ProfileVM } from './types';

	/**
	 * A character's profile, shown when a tree card is clicked. Purely
	 * presentational — the facts are already resolved by family-view.buildProfile().
	 * Closing (× / backdrop / Escape) is handled here so callers only supply data.
	 * The portrait falls back to an initial letter when `profile.image` is unset.
	 */
	interface Props {
		profile: ProfileVM;
		onClose: () => void;
	}

	let { profile, onClose }: Props = $props();

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="modal-backdrop"
	role="button"
	tabindex="-1"
	aria-label={t('common.close')}
	onclick={onClose}
	onkeydown={(e) => e.key === 'Enter' && onClose()}
>
	<div
		class="modal sa-card"
		role="dialog"
		aria-modal="true"
		aria-label={profile.name}
		style:--accent={profile.accent}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		tabindex="-1"
	>
		<button class="modal-close" onclick={onClose} aria-label={t('common.close')}>×</button>
		{#if profile.image}
			<img class="avatar" src={profile.image} alt="" />
		{:else}
			<div class="avatar avatar-fallback" aria-hidden="true">{profile.initial}</div>
		{/if}
		<h2>{profile.name}</h2>
		<dl class="facts">
			{#if profile.house}
				<dt>{t('inspector.house')}</dt>
				<dd>{profile.house}</dd>
			{/if}
			{#if profile.faction}
				<dt>{t('inspector.faction')}</dt>
				<dd>{profile.faction}</dd>
			{/if}
			{#if profile.aliases.length}
				<dt>{t('tree.aliases')}</dt>
				<dd>{profile.aliases.join(', ')}</dd>
			{/if}
		</dl>
		{#if profile.facts.length}
			<ul class="bullet-facts">
				{#each profile.facts as fact (fact)}
					<li>{fact}</li>
				{/each}
			</ul>
		{:else}
			<p class="soon sa-muted">{t('tree.profileSoon')}</p>
		{/if}
	</div>
</div>

<style>
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
		border-radius: 50%;
		border: 2px solid var(--accent, var(--sa-border));
		object-fit: cover;
	}

	.avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--sa-surface-2);
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

	.bullet-facts {
		margin: 0;
		padding-left: 1.1rem;
		text-align: left;
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.bullet-facts li + li {
		margin-top: 0.2rem;
	}
</style>
