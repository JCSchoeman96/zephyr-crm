import type { Tables } from '$lib/types/database';

export type FulfilmentCase = Pick<
	Tables<'fulfilment_cases'>,
	| 'id'
	| 'fulfilment_number'
	| 'client_id'
	| 'lead_id'
	| 'accepted_quote_id'
	| 'status'
	| 'created_at'
	| 'updated_at'
	| 'completed_at'
	| 'cancelled_at'
	| 'cancel_reason'
	| 'lock_version'
>;

export type FulfilmentStep = Pick<
	Tables<'fulfilment_steps'>,
	| 'id'
	| 'fulfilment_case_id'
	| 'type'
	| 'status'
	| 'scheduled_for'
	| 'completed_at'
	| 'tracking_reference'
	| 'notes'
	| 'created_at'
	| 'updated_at'
	| 'lock_version'
	| 'cancelled_at'
	| 'cancel_reason'
>;

export type FulfilmentPayment = Pick<
	Tables<'payment_milestones'>,
	| 'id'
	| 'fulfilment_case_id'
	| 'type'
	| 'status'
	| 'requested_at'
	| 'received_at'
	| 'received_recorded_by'
	| 'note'
	| 'created_at'
	| 'updated_at'
	| 'lock_version'
>;

export type FulfilmentTask = Omit<
	Pick<
		Tables<'tasks'>,
		| 'id'
		| 'fulfilment_case_id'
		| 'lead_id'
		| 'client_id'
		| 'quote_id'
		| 'type'
		| 'title'
		| 'description'
		| 'assigned_to'
		| 'due_at'
		| 'status'
		| 'lock_version'
		| 'created_at'
		| 'updated_at'
	>,
	'fulfilment_case_id'
> & { fulfilment_case_id: string };

export const fulfilmentQueueKeys = [
	'needs_planning',
	'installations',
	'courier',
	'pickup',
	'payment_attention',
	'completed'
] as const;
export type FulfilmentQueueKey = (typeof fulfilmentQueueKeys)[number];

export type FulfilmentQueueDefinition = {
	title: string;
	description: string;
};

export const fulfilmentQueueDefinitions: Record<FulfilmentQueueKey, FulfilmentQueueDefinition> = {
	needs_planning: {
		title: 'Needs planning',
		description: 'Open accepted sales with no active operational step.'
	},
	installations: {
		title: 'Installations',
		description: 'Installation work awaiting a date or already scheduled.'
	},
	courier: {
		title: 'Courier',
		description: 'Courier work awaiting dispatch, in transit, or delivered.'
	},
	pickup: {
		title: 'Pickup',
		description: 'Pickup work being prepared or ready for collection.'
	},
	payment_attention: {
		title: 'Payment attention',
		description: 'Awaiting payment evidence or an open payment follow-up task.'
	},
	completed: {
		title: 'Completed',
		description: 'Fulfilment cases completed by the trusted completion action.'
	}
};

export type FulfilmentQueueRow = {
	case: FulfilmentCase;
	steps: FulfilmentStep[];
	payments: FulfilmentPayment[];
	tasks: FulfilmentTask[];
};

export type FulfilmentQueue = FulfilmentQueueDefinition & {
	key: FulfilmentQueueKey;
	rows: FulfilmentQueueRow[];
};

export type FulfilmentQueues = Record<FulfilmentQueueKey, FulfilmentQueue>;

const successfulStepStatuses = new Set(['completed', 'delivered', 'collected']);

function activeSteps(steps: FulfilmentStep[]) {
	return steps.filter(
		(step) => !successfulStepStatuses.has(step.status) && step.status !== 'cancelled'
	);
}

function nonCancelledSteps(steps: FulfilmentStep[]) {
	return steps.filter((step) => step.status !== 'cancelled');
}

export function isTaskOverdue(task: FulfilmentTask | null | undefined, now = new Date()) {
	if (!task || task.status !== 'open' || !task.due_at) return false;
	return new Date(task.due_at).getTime() < now.getTime();
}

function matchesQueue(queue: FulfilmentQueueKey, row: FulfilmentQueueRow) {
	const isOpen = row.case.status === 'open';
	const active = activeSteps(row.steps);
	const visibleSteps = nonCancelledSteps(row.steps);

	switch (queue) {
		case 'needs_planning':
			return isOpen && active.length === 0;
		case 'installations':
			return (
				isOpen &&
				active.some(
					(step) =>
						step.type === 'installation' && ['awaiting_schedule', 'scheduled'].includes(step.status)
				)
			);
		case 'courier':
			return (
				isOpen &&
				visibleSteps.some(
					(step) =>
						step.type === 'courier' &&
						['awaiting_dispatch', 'dispatched', 'delivered'].includes(step.status)
				)
			);
		case 'pickup':
			return (
				isOpen &&
				active.some(
					(step) =>
						step.type === 'pickup' && ['preparing', 'ready_for_collection'].includes(step.status)
				)
			);
		case 'payment_attention':
			return (
				isOpen &&
				(row.payments.some((payment) => payment.status === 'awaiting') ||
					row.tasks.some((task) => task.status === 'open' && task.type === 'payment_follow_up'))
			);
		case 'completed':
			return row.case.status === 'completed';
	}
}

export function deriveFulfilmentQueues(
	cases: FulfilmentCase[],
	steps: FulfilmentStep[],
	payments: FulfilmentPayment[],
	tasks: FulfilmentTask[]
): FulfilmentQueues {
	const stepsByCase = new Map<string, FulfilmentStep[]>();
	const paymentsByCase = new Map<string, FulfilmentPayment[]>();
	const tasksByCase = new Map<string, FulfilmentTask[]>();

	function groupByCase<T extends { fulfilment_case_id: string }>(
		rows: T[],
		target: Map<string, T[]>
	) {
		for (const row of rows) {
			const current = target.get(row.fulfilment_case_id) ?? [];
			current.push(row);
			target.set(row.fulfilment_case_id, current);
		}
	}
	groupByCase(steps, stepsByCase);
	groupByCase(payments, paymentsByCase);
	groupByCase(tasks, tasksByCase);

	const rows = cases.map((currentCase) => ({
		case: currentCase,
		steps: stepsByCase.get(currentCase.id) ?? [],
		payments: paymentsByCase.get(currentCase.id) ?? [],
		tasks: tasksByCase.get(currentCase.id) ?? []
	}));

	return Object.fromEntries(
		fulfilmentQueueKeys.map((key) => [
			key,
			{
				key,
				...fulfilmentQueueDefinitions[key],
				rows: rows.filter((row) => matchesQueue(key, row))
			}
		])
	) as FulfilmentQueues;
}
