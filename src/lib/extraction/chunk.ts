/**
 * Splits a long source into chunks the model can handle, breaking on paragraph
 * boundaries so sentences/sections stay intact. Intentionally simple (greedy
 * accumulation); per-chunk results are merged downstream by entity id.
 */
export function chunkText(text: string, maxChars = 12000): string[] {
	const normalized = text.replace(/\r\n/g, '\n').trim();
	if (!normalized) return [];
	if (normalized.length <= maxChars) return [normalized];

	const paragraphs = normalized.split(/\n{2,}/);
	const chunks: string[] = [];
	let current = '';

	for (const para of paragraphs) {
		const piece = para.trim();
		if (!piece) continue;

		if (piece.length > maxChars) {
			// A single oversized paragraph: flush, then hard-split it.
			if (current) {
				chunks.push(current);
				current = '';
			}
			for (let i = 0; i < piece.length; i += maxChars) {
				chunks.push(piece.slice(i, i + maxChars));
			}
			continue;
		}

		if (current && current.length + piece.length + 2 > maxChars) {
			chunks.push(current);
			current = piece;
		} else {
			current = current ? `${current}\n\n${piece}` : piece;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}
