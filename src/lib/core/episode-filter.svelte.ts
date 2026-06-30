import { clock } from './clock.svelte';
import type { EpisodeGroup } from './derive';

/**
 * Shared episode-range filter, used by both the Timeline and the Map so the two
 * views stay in lockstep. Holds the raw `from`/`to` picks (Svelte 5 `$state`);
 * the contiguous span is resolved against the ordered episode keys on demand,
 * normalised to low..high so any pair of picks yields a valid consecutive range.
 * `null` on either end means "the full span".
 */
class EpisodeRange {
	from = $state<string | null>(null);
	to = $state<string | null>(null);

	/** Resolve the picks to inclusive low/high indices within `keys`. */
	bounds(keys: string[]): { lo: number; hi: number } {
		const f = this.from && keys.includes(this.from) ? keys.indexOf(this.from) : 0;
		const t = this.to && keys.includes(this.to) ? keys.indexOf(this.to) : keys.length - 1;
		return { lo: Math.min(f, t), hi: Math.max(f, t) };
	}

	selectedKeys(keys: string[]): Set<string> {
		const { lo, hi } = this.bounds(keys);
		return new Set(keys.slice(lo, hi + 1));
	}

	isFull(keys: string[]): boolean {
		const { lo, hi } = this.bounds(keys);
		return lo === 0 && hi === keys.length - 1;
	}

	/** Move the shared clock to the start of the first episode in the range. */
	private seek(groups: EpisodeGroup[]): void {
		const { lo } = this.bounds(groups.map((g) => g.key));
		const first = groups[lo];
		if (first) clock.seek(first.orderStart);
	}

	setFrom(key: string, groups: EpisodeGroup[]): void {
		this.from = key;
		this.seek(groups);
	}
	setTo(key: string, groups: EpisodeGroup[]): void {
		this.to = key;
		this.seek(groups);
	}
	reset(): void {
		this.from = null;
		this.to = null;
	}
}

/** App-wide singleton shared by the Timeline and Map episode filters. */
export const episodeRange = new EpisodeRange();
