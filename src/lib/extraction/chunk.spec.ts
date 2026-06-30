import { describe, it, expect } from 'vitest';
import { chunkText } from './chunk';

describe('chunkText', () => {
	it('returns a single chunk for short text', () => {
		expect(chunkText('Hello world')).toEqual(['Hello world']);
	});

	it('returns nothing for empty/whitespace input', () => {
		expect(chunkText('   \n  ')).toEqual([]);
	});

	it('splits on paragraph boundaries when over the limit', () => {
		const para = 'x'.repeat(40);
		const text = Array.from({ length: 10 }, () => para).join('\n\n');
		const chunks = chunkText(text, 100);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
		// no content lost (ignoring the joiners)
		expect(chunks.join('').replace(/\n/g, '')).toBe(text.replace(/\n/g, ''));
	});
});
