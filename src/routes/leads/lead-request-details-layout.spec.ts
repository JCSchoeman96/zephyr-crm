import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const leadPageSource = readFileSync(new URL('./[id]/+page.svelte', import.meta.url), 'utf8');

describe('lead request details layout', () => {
	it('removes separators from the final grid row', () => {
		expect(leadPageSource).toContain('.lead-request-fields > div:last-child {');
		expect(leadPageSource).toContain(
			'.lead-request-fields > div:nth-last-child(2):nth-child(odd) {'
		);
	});
});
