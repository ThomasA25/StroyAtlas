import { describe, it, expect } from 'vitest';
import { toAnthropicJsonSchema } from './schema';

describe('toAnthropicJsonSchema', () => {
	it('produces a strict JSON schema for the extraction contract', () => {
		const schema = toAnthropicJsonSchema() as Record<string, any>;
		expect(schema.$schema).toBeUndefined();
		expect(schema.type).toBe('object');
		expect(schema.additionalProperties).toBe(false);
		expect(schema.properties.source).toBeDefined();
		expect(schema.properties.story).toBeDefined();
		// nested objects are strict too
		expect(schema.properties.source.additionalProperties).toBe(false);
	});
});
