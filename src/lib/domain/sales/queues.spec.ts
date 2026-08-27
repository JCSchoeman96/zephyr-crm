import { describe, expect, it } from 'vitest';
import { deriveSalesQueueRows, type SalesQueueLead, type SalesQueueQuote } from './queues';

const lead = (id: string, pipeline_stage: SalesQueueLead['pipeline_stage']): SalesQueueLead => ({
	id,
	lead_number: Number(id),
	first_name: 'Queue',
	last_name: id,
	company: null,
	email: `${id}@example.test`,
	phone: null,
	message: 'Meaningful enquiry',
	qualification_notes: null,
	qualification_started_at: null,
	qualified_at: null,
	pipeline_stage,
	attention_state: 'none',
	attention_reason: null,
	lock_version: 1,
	updated_at: '2026-08-26T10:00:00.000Z',
	last_activity_at: null
});

const quote = (
	id: string,
	lead_id: string,
	status: SalesQueueQuote['status'],
	created_at: string
): SalesQueueQuote => ({
	id,
	lead_id,
	quote_number: `Q-${id}`,
	revision_number: 1,
	status,
	subject: `Quote ${id}`,
	currency: 'ZAR',
	total: 1000,
	lock_version: 1,
	created_at,
	valid_until: '2026-09-25'
});

describe('Sales queue derivation', () => {
	it('keeps each queue tied to its canonical Lead stage', () => {
		const rows = deriveSalesQueueRows(
			'enquiries',
			[lead('new', 'NEW'), lead('qualification', 'QUALIFICATION')],
			[]
		);

		expect(rows.map((row) => row.lead.id)).toEqual(['new']);
		expect(rows[0]?.quoteState).toBe('not_started');
	});

	it('derives Proposal work from the latest actionable Quote', () => {
		const rows = deriveSalesQueueRows(
			'proposals',
			[lead('proposal', 'PROPOSAL')],
			[
				quote('old', 'proposal', 'ready', '2026-08-26T09:00:00.000Z'),
				quote('new', 'proposal', 'draft', '2026-08-26T10:00:00.000Z')
			]
		);

		expect(rows[0]?.quote?.id).toBe('new');
		expect(rows[0]?.quoteState).toBe('draft');
	});

	it('exposes only a current sent decision Quote and rejects a superseded sent revision', () => {
		const rows = deriveSalesQueueRows(
			'decisions',
			[lead('current', 'DECISION'), lead('adjusted', 'DECISION')],
			[
				quote('current-sent', 'current', 'sent', '2026-08-26T10:00:00.000Z'),
				quote('old-sent', 'adjusted', 'sent', '2026-08-26T09:00:00.000Z'),
				quote('new-draft', 'adjusted', 'draft', '2026-08-26T11:00:00.000Z')
			]
		);

		expect(rows.map((row) => row.lead.id)).toEqual(['current']);
		expect(rows[0]?.quote?.id).toBe('current-sent');
	});
});
