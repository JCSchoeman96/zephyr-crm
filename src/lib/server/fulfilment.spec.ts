import { describe, expect, it } from 'vitest';
import { loadFulfilmentDetail, loadFulfilmentQueues } from './fulfilment';

type Row = Record<string, unknown>;

class QueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
	private rows: Row[];

	constructor(
		readonly table: string,
		rows: Row[],
		private readonly audit: QueryBuilder[]
	) {
		this.rows = [...rows];
		audit.push(this);
	}

	select() {
		return this;
	}

	in(column: string, values: unknown[]) {
		this.rows = this.rows.filter((row) => values.includes(row[column]));
		return this;
	}

	eq(column: string, value: unknown) {
		this.rows = this.rows.filter((row) => row[column] === value);
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

	limit(value: number) {
		this.rows = this.rows.slice(0, value);
		return this;
	}

	range(from: number, to: number) {
		this.rows = this.rows.slice(from, to + 1);
		return this;
	}

	maybeSingle() {
		return Promise.resolve({ data: this.rows[0] ?? null, error: null });
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
	readonly queries: QueryBuilder[] = [];

	constructor(private readonly rows: Record<string, Row[]>) {}

	from(table: string) {
		return new QueryBuilder(table, this.rows[table] ?? [], this.queries);
	}
}

function fulfilmentCase(id: string): Row {
	return {
		id,
		fulfilment_number: 1,
		client_id: 'client-1',
		lead_id: 'lead-1',
		accepted_quote_id: 'quote-1',
		status: 'open',
		created_at: '2026-08-27T08:00:00Z',
		updated_at: '2026-08-27T08:00:00Z',
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null,
		lock_version: 1
	};
}

describe('Fulfilment server loading', () => {
	it("does not let one busy case hide another case's operational step", async () => {
		const caseId = 'case-1';
		const cancelledSteps = Array.from({ length: 500 }, (_, index) => ({
			id: `cancelled-${index}`,
			fulfilment_case_id: caseId,
			type: 'installation',
			status: 'cancelled',
			created_at: `2026-08-27T08:${String(index % 60).padStart(2, '0')}:00Z`
		}));
		const client = new FakeSupabase({
			fulfilment_cases: [fulfilmentCase(caseId)],
			fulfilment_steps: [
				...cancelledSteps,
				{
					id: 'active-installation',
					fulfilment_case_id: caseId,
					type: 'installation',
					status: 'awaiting_schedule',
					created_at: '2026-08-28T08:00:00Z'
				}
			],
			payment_milestones: [],
			tasks: [],
			clients: [{ id: 'client-1' }],
			leads: [{ id: 'lead-1' }],
			quotes: [{ id: 'quote-1' }]
		});

		const queues = await loadFulfilmentQueues(client as never);

		expect(queues.installations.rows).toHaveLength(1);
		expect(queues.installations.rows[0].steps).toHaveLength(501);
	});

	it('reports bounded detail history instead of presenting truncation as empty', async () => {
		const client = new FakeSupabase({
			fulfilment_cases: [fulfilmentCase('case-1')],
			fulfilment_steps: Array.from({ length: 501 }, (_, index) => ({
				id: `step-${index}`,
				fulfilment_case_id: 'case-1',
				type: 'installation',
				status: 'cancelled',
				created_at: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T08:00:00Z`
			})),
			payment_milestones: [],
			tasks: [],
			activities: Array.from({ length: 101 }, (_, index) => ({
				id: `activity-${index}`,
				fulfilment_case_id: 'case-1',
				event_type: 'fulfilment_step_cancelled',
				metadata: {},
				summary: 'History fixture',
				occurred_at: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T08:00:00Z`,
				created_at: '2026-08-27T08:00:00Z',
				actor_id: null
			})),
			clients: [{ id: 'client-1' }],
			leads: [{ id: 'lead-1' }],
			quotes: [{ id: 'quote-1' }],
			profiles: []
		});

		const detail = await loadFulfilmentDetail(client as never, 'case-1');

		expect(detail.steps).toHaveLength(500);
		expect(detail.activities).toHaveLength(100);
		expect(detail.truncated).toEqual({
			steps: true,
			payments: false,
			tasks: false,
			activities: true
		});
	});
});
