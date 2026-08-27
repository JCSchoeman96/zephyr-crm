import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import {
	deriveFulfilmentQueues,
	isTaskOverdue,
	type FulfilmentCase,
	type FulfilmentPayment,
	type FulfilmentQueue,
	type FulfilmentQueueKey,
	type FulfilmentQueueRow,
	type FulfilmentStep,
	type FulfilmentTask
} from '$lib/domain/fulfilment/queues';

export const fulfilmentLimits = {
	cases: 100,
	steps: 500,
	payments: 250,
	tasks: 500,
	activities: 100,
	context: 100
} as const;

const fulfilmentRelationPageSize = 500;

const emptyId = '00000000-0000-0000-0000-000000000000';

const caseSelect =
	'id,fulfilment_number,client_id,lead_id,accepted_quote_id,status,created_at,updated_at,completed_at,cancelled_at,cancel_reason,lock_version';
const stepSelect =
	'id,fulfilment_case_id,type,status,scheduled_for,completed_at,tracking_reference,notes,created_at,updated_at,lock_version,cancelled_at,cancel_reason';
const paymentSelect =
	'id,fulfilment_case_id,type,status,requested_at,received_at,received_recorded_by,note,created_at,updated_at,lock_version';
const taskSelect =
	'id,fulfilment_case_id,lead_id,client_id,quote_id,type,title,description,assigned_to,due_at,status,lock_version,created_at,updated_at';
const clientSelect = 'id,client_number,display_name,company_name,email,phone,status';
const leadSelect = 'id,lead_number,first_name,last_name,company,email,phone,pipeline_stage';
const quoteSelect =
	'id,lead_id,client_id,quote_number,revision_number,status,subject,currency,subtotal,tax_amount,total,valid_until,accepted_at,accepted_by,acceptance_source,acceptance_evidence,created_at,lock_version';
const activitySelect = 'id,event_type,summary,metadata,occurred_at,created_at,actor_id';
const profileSelect = 'id,full_name,email,role';

type ClientSummary = Pick<
	Tables<'clients'>,
	'id' | 'client_number' | 'display_name' | 'company_name' | 'email' | 'phone' | 'status'
>;

type LeadSummary = Pick<
	Tables<'leads'>,
	| 'id'
	| 'lead_number'
	| 'first_name'
	| 'last_name'
	| 'company'
	| 'email'
	| 'phone'
	| 'pipeline_stage'
>;

type QuoteSummary = Pick<
	Tables<'quotes'>,
	| 'id'
	| 'lead_id'
	| 'client_id'
	| 'quote_number'
	| 'revision_number'
	| 'status'
	| 'subject'
	| 'currency'
	| 'subtotal'
	| 'tax_amount'
	| 'total'
	| 'valid_until'
	| 'accepted_at'
	| 'accepted_by'
	| 'acceptance_source'
	| 'acceptance_evidence'
	| 'created_at'
	| 'lock_version'
>;

type ActivitySummary = Pick<
	Tables<'activities'>,
	'id' | 'event_type' | 'summary' | 'metadata' | 'occurred_at' | 'created_at' | 'actor_id'
>;

type ProfileSummary = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email' | 'role'>;

export type FulfilmentQueueRowView = FulfilmentQueueRow & {
	client: ClientSummary | null;
	lead: LeadSummary | null;
	quote: QuoteSummary | null;
	nextWork: string;
};

export type FulfilmentQueueView = Omit<FulfilmentQueue, 'rows'> & {
	rows: FulfilmentQueueRowView[];
};

export type FulfilmentQueuesView = Record<FulfilmentQueueKey, FulfilmentQueueView>;

export type FulfilmentDetail = {
	case: FulfilmentCase;
	client: ClientSummary | null;
	lead: LeadSummary | null;
	quote: QuoteSummary | null;
	steps: FulfilmentStep[];
	payments: FulfilmentPayment[];
	tasks: (FulfilmentTask & { is_overdue: boolean })[];
	activities: ActivitySummary[];
	actors: ProfileSummary[];
	truncated: {
		steps: boolean;
		payments: boolean;
		tasks: boolean;
		activities: boolean;
	};
};

type FulfilmentReadClient = SupabaseClient<Database>;

function ids(values: string[]) {
	return values.length > 0 ? [...new Set(values)] : [emptyId];
}

function mapById<T extends { id: string }>(rows: T[]) {
	return new Map(rows.map((row) => [row.id, row]));
}

function nextWork(row: FulfilmentQueueRow) {
	if (row.case.status === 'completed') return 'Completed';
	if (row.case.status === 'cancelled') return 'Cancelled';
	const activeStep = row.steps.find(
		(step) => !['completed', 'delivered', 'collected', 'cancelled'].includes(step.status)
	);
	if (activeStep) {
		const labels: Record<string, string> = {
			awaiting_schedule: 'Schedule installation',
			scheduled: 'Installation scheduled',
			awaiting_dispatch: 'Dispatch courier',
			dispatched: 'Confirm delivery',
			preparing: 'Prepare pickup',
			ready_for_collection: 'Confirm collection'
		};
		return labels[activeStep.status] ?? 'Review work';
	}
	if (row.payments.some((payment) => payment.status === 'awaiting')) {
		return 'Record payment evidence';
	}
	if (row.tasks.some((task) => task.status === 'open' && task.type === 'payment_follow_up')) {
		return 'Payment follow-up';
	}
	return 'Plan next step';
}

async function loadContext(
	supabase: FulfilmentReadClient,
	cases: FulfilmentCase[]
): Promise<{
	clients: ClientSummary[];
	leads: LeadSummary[];
	quotes: QuoteSummary[];
}> {
	const clientIds = ids(cases.map((currentCase) => currentCase.client_id));
	const leadIds = ids(cases.map((currentCase) => currentCase.lead_id));
	const quoteIds = ids(cases.map((currentCase) => currentCase.accepted_quote_id));
	const [clientsResponse, leadsResponse, quotesResponse] = await Promise.all([
		supabase
			.from('clients')
			.select(clientSelect)
			.in('id', clientIds)
			.limit(fulfilmentLimits.context),
		supabase.from('leads').select(leadSelect).in('id', leadIds).limit(fulfilmentLimits.context),
		supabase.from('quotes').select(quoteSelect).in('id', quoteIds).limit(fulfilmentLimits.context)
	]);
	if (clientsResponse.error || leadsResponse.error || quotesResponse.error) {
		throw error(500, 'Could not load Fulfilment lineage');
	}
	return {
		clients: (clientsResponse.data ?? []) as ClientSummary[],
		leads: (leadsResponse.data ?? []) as LeadSummary[],
		quotes: (quotesResponse.data ?? []) as QuoteSummary[]
	};
}

async function loadRelations(
	supabase: FulfilmentReadClient,
	caseIds: string[]
): Promise<{
	steps: FulfilmentStep[];
	payments: FulfilmentPayment[];
	tasks: FulfilmentTask[];
}> {
	const relationIds = ids(caseIds);
	const loadPages = async <T>(
		queryPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
	) => {
		const rows: T[] = [];
		for (let from = 0; ; from += fulfilmentRelationPageSize) {
			const response = await queryPage(from, from + fulfilmentRelationPageSize - 1);
			if (response.error) throw error(500, 'Could not load Fulfilment queue work');
			const page = (response.data ?? []) as T[];
			rows.push(...page);
			if (page.length < fulfilmentRelationPageSize) return rows;
		}
	};
	const [steps, payments, tasks] = await Promise.all([
		loadPages<FulfilmentStep>((from, to) =>
			supabase
				.from('fulfilment_steps')
				.select(stepSelect)
				.in('fulfilment_case_id', relationIds)
				.order('created_at', { ascending: true })
				.order('id', { ascending: true })
				.range(from, to)
		),
		loadPages<FulfilmentPayment>((from, to) =>
			supabase
				.from('payment_milestones')
				.select(paymentSelect)
				.in('fulfilment_case_id', relationIds)
				.order('type', { ascending: true })
				.order('id', { ascending: true })
				.range(from, to)
		),
		loadPages<FulfilmentTask>((from, to) =>
			supabase
				.from('tasks')
				.select(taskSelect)
				.in('fulfilment_case_id', relationIds)
				.order('created_at', { ascending: false })
				.order('id', { ascending: true })
				.range(from, to)
		)
	]);
	return {
		steps: steps as FulfilmentStep[],
		payments: payments as FulfilmentPayment[],
		tasks: tasks as FulfilmentTask[]
	};
}

function decorateQueues(
	queues: ReturnType<typeof deriveFulfilmentQueues>,
	clients: ClientSummary[],
	leads: LeadSummary[],
	quotes: QuoteSummary[]
): FulfilmentQueuesView {
	const clientById = mapById(clients);
	const leadById = mapById(leads);
	const quoteById = mapById(quotes);
	return Object.fromEntries(
		Object.entries(queues).map(([key, queue]) => [
			key,
			{
				...queue,
				rows: queue.rows.map((row) => ({
					...row,
					client: clientById.get(row.case.client_id) ?? null,
					lead: leadById.get(row.case.lead_id) ?? null,
					quote: quoteById.get(row.case.accepted_quote_id) ?? null,
					nextWork: nextWork(row)
				}))
			}
		])
	) as FulfilmentQueuesView;
}

export async function loadFulfilmentQueues(
	supabase: FulfilmentReadClient
): Promise<FulfilmentQueuesView> {
	const casesResponse = await supabase
		.from('fulfilment_cases')
		.select(caseSelect)
		.in('status', ['open', 'completed'])
		.order('updated_at', { ascending: false })
		.order('id', { ascending: true })
		.limit(fulfilmentLimits.cases);
	if (casesResponse.error) throw error(500, 'Could not load Fulfilment queues');
	const cases = (casesResponse.data ?? []) as FulfilmentCase[];
	const [{ steps, payments, tasks }, context] = await Promise.all([
		loadRelations(
			supabase,
			cases.map((currentCase) => currentCase.id)
		),
		loadContext(supabase, cases)
	]);
	return decorateQueues(
		deriveFulfilmentQueues(cases, steps, payments, tasks),
		context.clients,
		context.leads,
		context.quotes
	);
}

export async function loadFulfilmentDetail(
	supabase: FulfilmentReadClient,
	caseId: string
): Promise<FulfilmentDetail> {
	const caseResponse = await supabase
		.from('fulfilment_cases')
		.select(caseSelect)
		.eq('id', caseId)
		.maybeSingle();
	if (caseResponse.error) throw error(500, 'Could not load Fulfilment details');
	if (!caseResponse.data) throw error(404, 'Fulfilment case not found');
	const currentCase = caseResponse.data as FulfilmentCase;
	const [
		clientResponse,
		leadResponse,
		quoteResponse,
		stepsResponse,
		paymentsResponse,
		tasksResponse,
		activitiesResponse
	] = await Promise.all([
		supabase.from('clients').select(clientSelect).eq('id', currentCase.client_id).maybeSingle(),
		supabase.from('leads').select(leadSelect).eq('id', currentCase.lead_id).maybeSingle(),
		supabase
			.from('quotes')
			.select(quoteSelect)
			.eq('id', currentCase.accepted_quote_id)
			.maybeSingle(),
		supabase
			.from('fulfilment_steps')
			.select(stepSelect)
			.eq('fulfilment_case_id', caseId)
			.order('created_at', { ascending: true })
			.order('id', { ascending: true })
			.limit(fulfilmentLimits.steps + 1),
		supabase
			.from('payment_milestones')
			.select(paymentSelect)
			.eq('fulfilment_case_id', caseId)
			.order('type', { ascending: true })
			.order('id', { ascending: true })
			.limit(fulfilmentLimits.payments + 1),
		supabase
			.from('tasks')
			.select(taskSelect)
			.eq('fulfilment_case_id', caseId)
			.order('created_at', { ascending: false })
			.order('id', { ascending: true })
			.limit(fulfilmentLimits.tasks + 1),
		supabase
			.from('activities')
			.select(activitySelect)
			.eq('fulfilment_case_id', caseId)
			.order('occurred_at', { ascending: false })
			.order('id', { ascending: true })
			.limit(fulfilmentLimits.activities + 1)
	]);
	if (
		clientResponse.error ||
		leadResponse.error ||
		quoteResponse.error ||
		stepsResponse.error ||
		paymentsResponse.error ||
		tasksResponse.error ||
		activitiesResponse.error
	) {
		throw error(500, 'Could not load Fulfilment history');
	}
	const stepRows = (stepsResponse.data ?? []) as FulfilmentStep[];
	const paymentRows = (paymentsResponse.data ?? []) as FulfilmentPayment[];
	const taskRows = (tasksResponse.data ?? []) as FulfilmentTask[];
	const activityRows = (activitiesResponse.data ?? []) as ActivitySummary[];
	const steps = stepRows.slice(0, fulfilmentLimits.steps);
	const payments = paymentRows.slice(0, fulfilmentLimits.payments);
	const tasks = taskRows.slice(0, fulfilmentLimits.tasks);
	const activities = activityRows.slice(0, fulfilmentLimits.activities);
	const actorIds = ids([
		...activities.flatMap((activity) => (activity.actor_id ? [activity.actor_id] : [])),
		...payments.flatMap((payment) =>
			payment.received_recorded_by ? [payment.received_recorded_by] : []
		),
		...tasks.flatMap((task) => (task.assigned_to ? [task.assigned_to] : []))
	]);
	const actorsResponse = await supabase
		.from('profiles')
		.select(profileSelect)
		.in('id', actorIds)
		.limit(fulfilmentLimits.context);
	if (actorsResponse.error) throw error(500, 'Could not load Fulfilment actors');
	return {
		case: currentCase,
		client: (clientResponse.data as ClientSummary | null) ?? null,
		lead: (leadResponse.data as LeadSummary | null) ?? null,
		quote: (quoteResponse.data as QuoteSummary | null) ?? null,
		steps,
		payments,
		tasks: tasks.map((task) => ({ ...task, is_overdue: isTaskOverdue(task) })),
		activities,
		actors: (actorsResponse.data ?? []) as ProfileSummary[],
		truncated: {
			steps: stepRows.length > fulfilmentLimits.steps,
			payments: paymentRows.length > fulfilmentLimits.payments,
			tasks: taskRows.length > fulfilmentLimits.tasks,
			activities: activityRows.length > fulfilmentLimits.activities
		}
	};
}
