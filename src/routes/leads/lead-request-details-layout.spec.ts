import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const leadRequestSource = readFileSync(
	new URL('../../lib/components/leads/LeadOverviewTab.svelte', import.meta.url),
	'utf8'
);

describe('lead request details layout', () => {
	it('removes separators from the final grid row', () => {
		expect(leadRequestSource).toContain('.lead-request-fields > div:last-child {');
		expect(leadRequestSource).toContain(
			'.lead-request-fields > div:nth-last-child(2):nth-child(odd) {'
		);
	});

	it('gives accordion headings stronger hierarchy than field summaries', () => {
		expect(leadRequestSource).toContain(
			'.lead-request-group__summary strong {\n\t\tfont-size: var(--font-size-md);\n\t\tfont-weight: var(--font-weight-bold);'
		);
	});
});
