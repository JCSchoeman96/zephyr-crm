import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

function taskId(form: FormData) {
	const value = String(form.get('task_id') ?? '');
	if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('A valid Task ID is required');
	return value;
}

function lockVersion(form: FormData) {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid Task lock_version is required');
	return value;
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const requestedStatus = event.url.searchParams.get('status');
	const status =
		requestedStatus && ['open', 'completed', 'cancelled'].includes(requestedStatus)
			? requestedStatus
			: 'open';
	const overdue = event.url.searchParams.get('overdue') === 'true';
	let taskQuery = supabase
		.from('task_work_queue')
		.select('*')
		.eq('status', status)
		.order('due_at', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false });
	if (overdue) taskQuery = taskQuery.eq('is_overdue', true);
	const [tasksResponse, leadsResponse, staffResponse] = await Promise.all([
		taskQuery,
		supabase
			.from('leads')
			.select('id,first_name,last_name,pipeline_stage')
			.order('created_at', { ascending: false })
			.limit(100),
		supabase
			.from('profiles')
			.select('id,full_name,email,role')
			.eq('status', 'active')
			.in('role', ['owner', 'admin', 'sales'])
			.order('full_name')
	]);
	if (tasksResponse.error || leadsResponse.error || staffResponse.error)
		throw new Error('Could not load Tasks');
	return {
		profile,
		tasks: tasksResponse.data ?? [],
		leads: leadsResponse.data ?? [],
		staff: staffResponse.data ?? [],
		filters: { status, overdue }
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const leadId = String(form.get('lead_id') ?? '');
			const title = String(form.get('title') ?? '').trim();
			const dueAt = String(form.get('due_at') ?? '').trim();
			const assignedTo = String(form.get('assigned_to') ?? '').trim();
			const response = await supabase.rpc('create_task', {
				p_lead_id: leadId || undefined,
				p_type: String(form.get('type') ?? 'custom'),
				p_title: title,
				...(dueAt ? { p_due_at: new Date(dueAt).toISOString() } : {}),
				...(assignedTo ? { p_assigned_to: assignedTo } : {})
			});
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not create Task'
			});
		}
		throw redirect(303, '/tasks');
	},
	complete: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('complete_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form)
			});
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not complete Task'
			});
		}
		throw redirect(303, '/tasks');
	},
	reschedule: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const dueAt = String(form.get('due_at') ?? '').trim();
			if (!dueAt) return fail(422, { message: 'A due date is required' });
			const response = await supabase.rpc('reschedule_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form),
				p_due_at: new Date(dueAt).toISOString()
			});
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not reschedule Task'
			});
		}
		throw redirect(303, '/tasks');
	},
	cancel: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('cancel_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form)
			});
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not cancel Task'
			});
		}
		throw redirect(303, '/tasks');
	}
};
