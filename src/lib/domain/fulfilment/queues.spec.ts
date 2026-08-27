import { describe, expect, it } from 'vitest';
import type { Tables } from '$lib/types/database';
import {
	deriveFulfilmentQueues,
	isTaskOverdue,
	type FulfilmentCase,
	type FulfilmentPayment,
	type FulfilmentStep,
	type FulfilmentTask
} from './queues';

const caseRow = (id: string, status: string = 'open'): FulfilmentCase => ({
	id,
	fulfilment_number: Number(id),
	client_id: `client-${id}`,
	lead_id: `lead-${id}`,
	accepted_quote_id: `quote-${id}`,
	status,
	created_at: '2026-08-27T08:00:00.000Z',
	updated_at: '2026-08-27T08:00:00.000Z',
	completed_at: status === 'completed' ? '2026-08-27T12:00:00.000Z' : null,
	cancelled_at: status === 'cancelled' ? '2026-08-27T12:00:00.000Z' : null,
	cancel_reason: status === 'cancelled' ? 'Cancelled fixture' : null,
	lock_version: 1
});

const step = (
	id: string,
	fulfilment_case_id: string,
	type: Tables<'fulfilment_steps'>['type'],
	status: string
): FulfilmentStep => ({
	id,
	fulfilment_case_id,
	type,
	status,
	scheduled_for: status === 'scheduled' ? '2026-08-28T09:00:00.000Z' : null,
	completed_at: ['completed', 'delivered', 'collected'].includes(status)
		? '2026-08-28T12:00:00.000Z'
		: null,
	tracking_reference: null,
	notes: null,
	created_at: '2026-08-27T08:00:00.000Z',
	updated_at: '2026-08-27T08:00:00.000Z',
	lock_version: 1,
	cancelled_at: status === 'cancelled' ? '2026-08-27T12:00:00.000Z' : null,
	cancel_reason: status === 'cancelled' ? 'Cancelled step fixture' : null
});

const payment = (
	id: string,
	fulfilment_case_id: string,
	status: Tables<'payment_milestones'>['status'],
	type: Tables<'payment_milestones'>['type'] = 'deposit'
): FulfilmentPayment => ({
	id,
	fulfilment_case_id,
	type,
	status,
	requested_at: status === 'awaiting' || status === 'received' ? '2026-08-27T09:00:00.000Z' : null,
	received_at: status === 'received' ? '2026-08-27T11:00:00.000Z' : null,
	received_recorded_by: status === 'received' ? 'staff-1' : null,
	note: null,
	created_at: '2026-08-27T08:00:00.000Z',
	updated_at: '2026-08-27T08:00:00.000Z',
	lock_version: 1
});

const task = (
	id: string,
	fulfilment_case_id: string,
	due_at: string | null = null
): FulfilmentTask => ({
	id,
	fulfilment_case_id,
	lead_id: `lead-${fulfilment_case_id}`,
	client_id: `client-${fulfilment_case_id}`,
	quote_id: `quote-${fulfilment_case_id}`,
	type: 'payment_follow_up',
	title: 'Follow up payment',
	description: null,
	assigned_to: null,
	due_at,
	status: 'open',
	lock_version: 1,
	created_at: '2026-08-27T08:00:00.000Z',
	updated_at: '2026-08-27T08:00:00.000Z'
});

describe('Fulfilment queue derivation', () => {
	it('reconciles each queue to canonical case, step, payment, and task state', () => {
		const cases = [
			caseRow('planning'),
			caseRow('installation'),
			caseRow('courier'),
			caseRow('pickup'),
			caseRow('payment'),
			caseRow('completed', 'completed'),
			caseRow('cancelled', 'cancelled')
		];
		const queues = deriveFulfilmentQueues(
			cases,
			[
				step('installation-step', 'installation', 'installation', 'awaiting_schedule'),
				step('courier-step', 'courier', 'courier', 'dispatched'),
				step('pickup-step', 'pickup', 'pickup', 'ready_for_collection')
			],
			[payment('payment-milestone', 'payment', 'awaiting')],
			[]
		);

		expect(queues.needs_planning.rows.map((row) => row.case.id)).toEqual(['planning', 'payment']);
		expect(queues.installations.rows.map((row) => row.case.id)).toEqual(['installation']);
		expect(queues.courier.rows.map((row) => row.case.id)).toEqual(['courier']);
		expect(queues.pickup.rows.map((row) => row.case.id)).toEqual(['pickup']);
		expect(queues.payment_attention.rows.map((row) => row.case.id)).toEqual(['payment']);
		expect(queues.completed.rows.map((row) => row.case.id)).toEqual(['completed']);
	});

	it('includes an open payment follow-up task without changing milestone semantics', () => {
		const dueAt = '2026-08-26T08:00:00.000Z';
		const queues = deriveFulfilmentQueues(
			[caseRow('follow-up')],
			[],
			[payment('not-due', 'follow-up', 'not_due')],
			[task('follow-up-task', 'follow-up', dueAt)]
		);

		const row = queues.payment_attention.rows[0];
		expect(row?.payments[0]?.status).toBe('not_due');
		expect(row?.tasks[0]?.id).toBe('follow-up-task');
		expect(isTaskOverdue(row?.tasks[0], new Date('2026-08-27T08:00:00.000Z'))).toBe(true);
	});

	it('does not treat terminal or cancelled steps as active work', () => {
		const queues = deriveFulfilmentQueues(
			[caseRow('history')],
			[
				step('cancelled-step', 'history', 'installation', 'cancelled'),
				step('completed-step', 'history', 'courier', 'delivered')
			],
			[],
			[]
		);

		expect(queues.needs_planning.rows.map((row) => row.case.id)).toEqual(['history']);
		expect(queues.installations.rows).toHaveLength(0);
		expect(queues.courier.rows.map((row) => row.case.id)).toEqual(['history']);
	});
});
