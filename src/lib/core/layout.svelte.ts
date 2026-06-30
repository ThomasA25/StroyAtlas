/**
 * Per-board dashboard layout for the drag-and-drop panels. A "board" is a named
 * group of panels (e.g. "editor", "mapTimeline"). Per board we persist: the
 * widget ORDER (ids), each widget's WIDTH span ("full"/"half") so panels can sit
 * side by side, and each widget's HEIGHT in grid ROW units (an integer — heights
 * snap to a fixed row grid; content scrolls within). All reactive ($state),
 * stored in localStorage, and resolved tolerantly so changing the widget set in
 * code never breaks a stored layout.
 */

export type Span = 'full' | 'half';

const STORAGE_KEY = 'storyatlas:layout';
export const ROW_UNIT = 80; // px per grid row
export const MIN_ROWS = 2;
export const MAX_ROWS = 14;

type Saved = {
	order: Record<string, string[]>;
	span: Record<string, Record<string, Span>>;
	rows: Record<string, Record<string, number>>;
};

function load(): Saved {
	const empty: Saved = { order: {}, span: {}, rows: {} };
	if (typeof localStorage === 'undefined') return empty;
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		if (raw && typeof raw === 'object') {
			// Current format: { order, span, rows }. Legacy: { board: ids[] }.
			if (raw.order || raw.span || raw.rows) {
				return { order: raw.order ?? {}, span: raw.span ?? {}, rows: raw.rows ?? {} };
			}
			return { order: raw as Record<string, string[]>, span: {}, rows: {} };
		}
	} catch {
		/* ignore corrupt layout */
	}
	return empty;
}

function clampRows(n: number): number {
	return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(n)));
}

class LayoutStore {
	#initial = load();
	orders = $state<Record<string, string[]>>(this.#initial.order);
	spans = $state<Record<string, Record<string, Span>>>(this.#initial.span);
	rowsMap = $state<Record<string, Record<string, number>>>(this.#initial.rows);

	/** The saved order for a board reconciled with the current widget set. */
	ordered(board: string, defaultIds: string[]): string[] {
		const saved = this.orders[board] ?? [];
		const kept = saved.filter((id) => defaultIds.includes(id));
		const missing = defaultIds.filter((id) => !kept.includes(id));
		return [...kept, ...missing];
	}

	spanOf(board: string, id: string): Span {
		return this.spans[board]?.[id] ?? 'full';
	}

	rowsOf(board: string, id: string, fallback: number): number {
		return this.rowsMap[board]?.[id] ?? clampRows(fallback);
	}

	/** Has the user customised this board (order, width or height)? */
	isCustom(board: string): boolean {
		return !!this.orders[board] || !!this.spans[board] || !!this.rowsMap[board];
	}

	setOrder(board: string, ids: string[]): void {
		this.orders = { ...this.orders, [board]: ids };
		this.#persist();
	}

	setSpan(board: string, id: string, span: Span): void {
		this.spans = { ...this.spans, [board]: { ...this.spans[board], [id]: span } };
		this.#persist();
	}

	setRows(board: string, id: string, rows: number): void {
		this.rowsMap = {
			...this.rowsMap,
			[board]: { ...this.rowsMap[board], [id]: clampRows(rows) }
		};
		this.#persist();
	}

	/** Reset a board to its code-defined default order, widths and heights. */
	reset(board: string): void {
		const { [board]: _o, ...orders } = this.orders;
		const { [board]: _s, ...spans } = this.spans;
		const { [board]: _r, ...rows } = this.rowsMap;
		void _o;
		void _s;
		void _r;
		this.orders = orders;
		this.spans = spans;
		this.rowsMap = rows;
		this.#persist();
	}

	#persist(): void {
		if (typeof localStorage === 'undefined') return;
		const data: Saved = { order: this.orders, span: this.spans, rows: this.rowsMap };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
}

export const layout = new LayoutStore();
