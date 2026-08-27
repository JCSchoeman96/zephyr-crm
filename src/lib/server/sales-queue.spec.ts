import { describe, expect, it } from 'vitest';
import { loadSalesQueue } from './sales-queue';

type Row = Record<string, unknown>;

class QueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
	private rows: Row[];

	constructor(rows: Row[]) {
		this.rows = [...rows];
	}

	select() {
		return this;
	}

	eq(column: string, value: unknown) {
		this.rows = this.rows.filter((row) => row[column] === value);
		return this;
	}

	in(column: string, values: unknown[]) {
		this.rows = this.rows.filter((row) => values.includes(row[column]));
		return this;
	}

	order(column: string, options: { ascending: boolean }) {
		this.rows.sort((left, right) => {
			const leftValue = String(left[column] ?? '');
			const rightValue = String(right[column] ?? '');
			return options.ascending
				? leftValue.localeCompare(rightValue)
				: rightValue.localeCompare(leftValue);
		});
		return this;
	}

	range(from: number, to: number) {
		this.rows = this.rows.slice(from, to + 1);
		return this;
	}

	limit(value: number) {
		this.rows = this.rows.slice(0, value);
		return this;
	}

	then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
		onfulfilled?:
			((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
	}
}

class FakeSupabase {
	constructor(private readonly rows: Record<string, Row[]>) {}

	from(table: string) {
		return new QueryBuilder(this.rows[table] ?? []);
	}
}

function lead(id: string): Row {
	return {
		id,
		lead_number: 1,
		first_name: id,
		last_name: 'Lead',
		company: null,
		email: `${id}@example.test`,
		phone: null,
		message: 'Queue fixture',
		qualification_notes: null,
		qualification_started_at: null,
		qualified_at: null,
		pipeline_stage: 'DECISION',
		attention_state: 'waiting_on_client',
		attention_reason: null,
		lock_version: 1,
		updated_at: '2026-08-27T08:00:00Z',
		last_activity_at: '2026-08-27T08:00:00Z'
	};
}

function quote(id: string, leadId: string, createdAt: string): Row {
	return {
		id,
		lead_id: leadId,
		quote_number: id,
		revision_number: 1,
		status: 'sent',
		subject: 'Queue fixture',
		currency: 'ZAR',
		total: 100,
		lock_version: 1,
		created_at: createdAt,
		valid_until: '2026-09-27'
	};
}

describe('Sales queue server loading', () => {
	it('keeps the current quote for every loaded Lead beyond the global quote cap', async () => {
		const olderQuotes = Array.from({ length: 250 }, (_, index) =>
			quote(
				`quote-a-${index}`,
				'lead-a',
				`2026-08-${String(27 - Math.floor(index / 10)).padStart(2, '0')}T08:00:00Z`
			)
		);
		const client = new FakeSupabase({
			leads: [lead('lead-a'), lead('lead-b')],
			quotes: [...olderQuotes, quote('quote-b-current', 'lead-b', '2026-01-01T08:00:00Z')]
		});

		const result = await loadSalesQueue(client as never, 'decisions');

		expect(result.rows).toHaveLength(2);
		expect(result.rows.find((row) => row.lead.id === 'lead-b')?.quote?.id).toBe('quote-b-current');
	});
});
