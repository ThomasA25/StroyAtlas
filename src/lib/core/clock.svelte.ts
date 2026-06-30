/**
 * The shared playback clock — the single timing source the Map, Timeline, and
 * Graph all read from, so they animate in lockstep. `current` is a position on
 * the timeline measured in order_index units (fractional during playback);
 * `speed` is order-index units per second. Driven by requestAnimationFrame.
 */
export class PlaybackClock {
	current = $state(0);
	playing = $state(false);
	speed = $state(1);
	max = $state(0);

	#last = 0;
	#raf: number | null = null;

	setMax(max: number): void {
		this.max = Math.max(0, max);
		if (this.current > this.max) this.current = this.max;
	}

	seek(value: number): void {
		this.current = Math.min(this.max, Math.max(0, value));
	}

	play(): void {
		if (this.playing || this.max <= 0) return;
		if (this.current >= this.max) this.current = 0;
		this.playing = true;
		this.#last = performance.now();
		this.#raf = requestAnimationFrame(this.#tick);
	}

	pause(): void {
		this.playing = false;
		if (this.#raf != null) {
			cancelAnimationFrame(this.#raf);
			this.#raf = null;
		}
	}

	toggle(): void {
		if (this.playing) this.pause();
		else this.play();
	}

	#tick = (now: number): void => {
		if (!this.playing) return;
		const dt = (now - this.#last) / 1000;
		this.#last = now;
		const next = this.current + dt * this.speed;
		if (next >= this.max) {
			this.current = this.max;
			this.pause();
			return;
		}
		this.current = next;
		this.#raf = requestAnimationFrame(this.#tick);
	};
}

export const clock = new PlaybackClock();
