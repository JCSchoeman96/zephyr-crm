import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { normalizeDateRange } from '$lib/domain/analytics/metrics';
import { requireActiveStaff } from '$lib/server/require-auth';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numberValue(value: unknown) {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? numeric : 0;
}

function rows(value: unknown) {
	return Array.isArray(value)
		? value.filter((row): row is JsonRecord => Boolean(row && typeof row === 'object'))
		: [];
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const dateRange = normalizeDateRange(
		event.url.searchParams.get('from'),
		event.url.searchParams.get('to')
	);
	const range = { p_from: dateRange.from, p_to: dateRange.to };
	const [operationalResponse, kpiResponse, lostResponse, attributionResponse, recentTasksResponse] =
		await Promise.all([
			supabase.rpc('dashboard_operational_summary', range),
			supabase.rpc('dashboard_sales_kpis', range),
			supabase.rpc('dashboard_lost_analysis', { ...range, p_limit: 50 }),
			supabase.rpc('dashboard_attribution', { ...range, p_limit: 50 }),
			supabase
				.from('task_work_queue')
				.select('id,title,type,due_at,is_overdue,status,lead_id,assigned_to,lock_version')
				.eq('status', 'open')
				.order('due_at', { ascending: true, nullsFirst: false })
				.limit(5)
		]);
	if (
		operationalResponse.error ||
		kpiResponse.error ||
		lostResponse.error ||
		attributionResponse.error ||
		recentTasksResponse.error
	) {
		throw new Error('Could not load dashboard projections');
	}
	const operational = record(operationalResponse.data);
	const kpis = record(kpiResponse.data);
	const lost = record(lostResponse.data);
	const attribution = record(attributionResponse.data);
	return {
		profile,
		dateRange,
		operational: {
			newLeads: numberValue(operational.new_leads),
			overdueTasks: numberValue(operational.overdue_tasks),
			dueToday: numberValue(operational.due_today),
			waitingOnUs: numberValue(operational.waiting_on_us),
			waitingOnClient: numberValue(operational.waiting_on_client),
			expiringQuotes: numberValue(operational.expiring_quotes)
		},
		kpis: {
			leads: numberValue(kpis.new_leads),
			quotesSent: numberValue(kpis.quotes_sent),
			quoteValue: numberValue(kpis.quote_value),
			acceptedValue: numberValue(kpis.accepted_value),
			wonLeads: numberValue(kpis.won_leads),
			lostLeads: numberValue(kpis.lost_leads),
			conversionRate: numberValue(kpis.conversion_rate),
			pipelineValue: numberValue(kpis.pipeline_value)
		},
		lost: {
			byReason: rows(lost.by_reason).map((row) => ({
				reasonCode: String(row.reason_code ?? 'unknown'),
				reasonLabel: String(row.reason_label ?? 'Unknown'),
				lostCount: numberValue(row.lost_count),
				lostValue: numberValue(row.lost_value)
			})),
			bySource: rows(lost.by_source).map((row) => ({
				sourceCode: String(row.source_code ?? 'unknown'),
				lostCount: numberValue(row.lost_count),
				lostValue: numberValue(row.lost_value)
			}))
		},
		attribution: rows(attribution.rows).map((row) => ({
			sourceCode: String(row.source_code ?? 'unknown'),
			utmSource: String(row.utm_source ?? '(none)'),
			utmMedium: String(row.utm_medium ?? '(none)'),
			utmCampaign: String(row.utm_campaign ?? '(none)'),
			leadCount: numberValue(row.lead_count),
			wonCount: numberValue(row.won_count),
			revenue: numberValue(row.revenue)
		})),
		recentTasks: recentTasksResponse.data ?? []
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		if (locals.supabase) await locals.supabase.auth.signOut();
		throw redirect(303, '/login');
	}
};
