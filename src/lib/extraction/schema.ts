import { z } from 'zod';
import { extractionContract } from '$lib/core/contract';

/**
 * Builds the JSON Schema handed to Anthropic's `output_config.format`.
 *
 * The Zod contract is the single source — we convert it and enforce the two
 * things the structured-output API wants: `additionalProperties: false` on every
 * object, and no stray `$schema` key. (All contract fields are required and
 * nullable-where-allowed, so Zod already emits correct `required` arrays.)
 */
export function toAnthropicJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(extractionContract) as Record<string, unknown>;
	delete schema.$schema;
	enforceStrictObjects(schema);
	return schema;
}

function enforceStrictObjects(node: unknown): void {
	if (Array.isArray(node)) {
		for (const child of node) enforceStrictObjects(child);
		return;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
			obj.additionalProperties = false;
		}
		for (const value of Object.values(obj)) enforceStrictObjects(value);
	}
}
