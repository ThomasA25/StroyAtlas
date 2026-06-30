import Anthropic from '@anthropic-ai/sdk';
import { extractionContract, type ExtractionResult } from '$lib/core/contract';
import type { Project } from '$lib/core/model';
import { toAnthropicJsonSchema } from './schema';
import { chunkText } from './chunk';
import { mergeExtractionInto, nextOrderOffset } from './from-extraction';
import {
	EXTRACTION_SYSTEM,
	buildUserMessage,
	collectKnownEntities,
	type SourceMeta,
	type KnownEntities
} from './prompt';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 16000;

interface ExtractChunkArgs {
	apiKey: string;
	text: string;
	source: SourceMeta;
	known: KnownEntities;
	signal?: AbortSignal;
}

/**
 * Runs one structured-output extraction call and validates the result against
 * the Zod contract (the contract gate). Streaming is used so large outputs don't
 * hit request timeouts. Throws a friendly Error on refusal / malformed output.
 */
export async function extractChunk(args: ExtractChunkArgs): Promise<ExtractionResult> {
	const client = new Anthropic({ apiKey: args.apiKey, dangerouslyAllowBrowser: true });

	const stream = client.messages.stream(
		{
			model: MODEL,
			max_tokens: MAX_TOKENS,
			thinking: { type: 'adaptive' },
			output_config: {
				format: { type: 'json_schema', schema: toAnthropicJsonSchema() }
			},
			system: EXTRACTION_SYSTEM,
			messages: [{ role: 'user', content: buildUserMessage(args.text, args.source, args.known) }]
		},
		{ signal: args.signal }
	);

	const message = await stream.finalMessage();

	if (message.stop_reason === 'refusal') {
		throw new Error('The model declined to process this content (safety refusal).');
	}

	const textBlock = message.content.find((b) => b.type === 'text');
	if (!textBlock || textBlock.type !== 'text') {
		throw new Error('No structured output was returned by the model.');
	}

	let json: unknown;
	try {
		json = JSON.parse(textBlock.text);
	} catch {
		throw new Error('The model output was not valid JSON.');
	}

	// Contract gate: anything that does not match the schema is rejected here.
	return extractionContract.parse(json);
}

export interface RunExtractionArgs {
	apiKey: string;
	text: string;
	source: SourceMeta;
	/** Mutated in place — extracted entities are merged as an editable draft. */
	project: Project;
	onProgress?: (done: number, total: number) => void;
	signal?: AbortSignal;
}

/**
 * Chunks the source, extracts each chunk, and merges results into the project.
 * Known entities are recollected before every chunk so later chunks reuse the
 * ids established by earlier ones; order_index values are offset so chunks stack
 * sequentially on the timeline.
 */
export async function runExtraction(args: RunExtractionArgs): Promise<void> {
	const chunks = chunkText(args.text);
	if (chunks.length === 0) throw new Error('The source text is empty.');

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;
		const known = collectKnownEntities(args.project);
		const result = await extractChunk({
			apiKey: args.apiKey,
			text: chunk,
			source: args.source,
			known,
			signal: args.signal
		});
		mergeExtractionInto(args.project, result, { orderOffset: nextOrderOffset(args.project) });
		args.onProgress?.(i + 1, chunks.length);
	}
}
