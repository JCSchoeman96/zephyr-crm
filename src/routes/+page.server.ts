import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { requireActiveStaff } from '$lib/server/require-auth';
import { localCalendarDayBounds } from '$lib/time/zoned-datetime';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const now = new Date();
	const { configuration } = loadTrustedClientConfiguration();
	const dueDay = localCalendarDayBounds(configuration.locale.timezone, now);
	const today = now.toISOString().slice(0, 10);
	const expiryEnd = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
	const activeStages = ['NEW', 'QUALIFICATION', 'PROPOSAL', 'DECISION'];
	const count = { count: 'exact' as const, head: true };
	const [newLeads, overdue, dueToday, waitingOnUs, waitingOnClient, expiring, tasks, enquiries] =
		await Promise.all([
			supabase.from('leads').select('id', count).eq('pipeline_stage', 'NEW'),
			supabase
				.from('tasks')
				.select('id', count)
				.eq('status', 'open')
				.lt('due_at', now.toISOString()),
			supabase
				.from('tasks')
				.select('id', count)
				.eq('status', 'open')
				.gte('due_at', dueDay.startIso)
				.lt('due_at', dueDay.endIso),
			supabase
				.from('leads')
				.select('id', count)
				.in('pipeline_stage', activeStages)
				.eq('attention_state', 'waiting_on_us'),
			supabase
				.from('leads')
				.select('id', count)
				.in('pipeline_stage', activeStages)
				.eq('attention_state', 'waiting_on_client'),
			supabase
				.from('quotes')
				.select('id', count)
				.eq('status', 'sent')
				.gte('valid_until', today)
				.lte('valid_until', expiryEnd),
			supabase
				.from('tasks')
				.select('id,title,type,due_at,lead_id,client_id,quote_id,fulfilment_case_id')
				.eq('status', 'open')
				.order('due_at', { ascending: true, nullsFirst: false })
				.order('id')
				.limit(8),
			supabase
				.from('leads')
				.select('id,lead_number,first_name,last_name,company,created_at')
				.eq('pipeline_stage', 'NEW')
				.is('paused_at', null)
				.order('created_at')
				.order('id')
				.limit(5)
		]);
	if (
		[newLeads, overdue, dueToday, waitingOnUs, waitingOnClient, expiring, tasks, enquiries].some(
			(result) => result.error
		)
	) {
		throw error(503, 'Your work could not be loaded. Please reload the page.');
	}
	return {
		profile,
		operational: {
			newLeads: newLeads.count ?? 0,
			overdueTasks: overdue.count ?? 0,
			dueToday: dueToday.count ?? 0,
			waitingOnUs: waitingOnUs.count ?? 0,
			waitingOnClient: waitingOnClient.count ?? 0,
			expiringQuotes: expiring.count ?? 0
		},
		expiry: { from: today, to: expiryEnd },
		tasks: (tasks.data ?? []).map((task) => ({
			...task,
			isOverdue: Boolean(task.due_at && Date.parse(task.due_at) < now.getTime()),
			href: task.fulfilment_case_id
				? `/fulfilment/${task.fulfilment_case_id}`
				: task.quote_id
					? `/quotes/${task.quote_id}`
					: task.lead_id
						? `/leads/${task.lead_id}`
						: task.client_id
							? `/clients/${task.client_id}`
							: '/tasks'
		})),
		enquiries: enquiries.data ?? []
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		if (locals.supabase) await locals.supabase.auth.signOut();
		throw redirect(303, '/login');
	}
};
