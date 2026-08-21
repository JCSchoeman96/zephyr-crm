import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const [openTasksResponse, overdueTasksResponse, activeLeadsResponse, recentTasksResponse] =
		await Promise.all([
			supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
			supabase
				.from('task_work_queue')
				.select('id', { count: 'exact', head: true })
				.eq('status', 'open')
				.eq('is_overdue', true),
			supabase
				.from('leads')
				.select('id', { count: 'exact', head: true })
				.not('pipeline_stage', 'in', '(WON,LOST)'),
			supabase
				.from('task_work_queue')
				.select('id,title,type,due_at,is_overdue,status,lead_id,assigned_to,lock_version')
				.eq('status', 'open')
				.order('due_at', { ascending: true, nullsFirst: false })
				.limit(5)
		]);
	if (
		openTasksResponse.error ||
		overdueTasksResponse.error ||
		activeLeadsResponse.error ||
		recentTasksResponse.error
	) {
		throw new Error('Could not load dashboard projections');
	}
	return {
		profile,
		metrics: {
			openTasks: openTasksResponse.count ?? 0,
			overdueTasks: overdueTasksResponse.count ?? 0,
			activeLeads: activeLeadsResponse.count ?? 0
		},
		recentTasks: recentTasksResponse.data ?? []
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		if (locals.supabase) await locals.supabase.auth.signOut();
		throw redirect(303, '/login');
	}
};
