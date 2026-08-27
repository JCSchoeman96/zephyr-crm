import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actionFailureStatus, userFacingActionMessage } from '$lib/server/action-errors';
import { loadFulfilmentDetail } from '$lib/server/fulfilment';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function actionFailure(cause: unknown, fallback: string) {
	return fail(actionFailureStatus(cause), {
		message: userFacingActionMessage(cause, fallback)
	});
}

function formUuid(form: FormData, name: string, label: string) {
	const value = String(form.get(name) ?? '').trim();
	if (!uuidPattern.test(value)) throw new Error(`A valid ${label} is required`);
	return value;
}

function formLockVersion(form: FormData, label = 'record') {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`A valid ${label} lock version is required`);
	}
	return value;
}

function formText(form: FormData, name: string) {
	return String(form.get(name) ?? '').trim();
}

function optionalText(form: FormData, name: string) {
	return formText(form, name) || undefined;
}

function formDateTime(form: FormData, name: string) {
	const value = formText(form, name);
	if (!value) throw new Error('A scheduled time is required');
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error('A valid scheduled time is required');
	return date.toISOString();
}

function caseId(event: Parameters<NonNullable<Actions['createStep']>>[0]) {
	if (!uuidPattern.test(event.params.id)) throw error(404, 'Fulfilment case not found');
	return event.params.id;
}

function viewerFailure(role: string) {
	return role === 'viewer' ? fail(403, { message: 'Viewer access is read-only.' }) : null;
}

type RpcResponse = { error: unknown | null };

async function runMutation(
	event: Parameters<NonNullable<Actions['createStep']>>[0],
	fallback: string,
	operation: (form: FormData, caseId: string, role: string) => Promise<RpcResponse>,
	privileged = false
) {
	const { profile } = await requireActiveStaff(event);
	const denied = viewerFailure(profile.role);
	if (denied) return denied;
	if (privileged && !['owner', 'admin'].includes(profile.role)) {
		return fail(403, { message: 'Owner or Admin role required for this action.' });
	}
	try {
		const response = await operation(await event.request.formData(), caseId(event), profile.role);
		if (response.error) return actionFailure(response.error, fallback);
	} catch (cause) {
		return actionFailure(cause, fallback);
	}
	throw redirect(303, `/fulfilment/${event.params.id}`);
}

export const load: PageServerLoad = async (event) => {
	if (!uuidPattern.test(event.params.id)) throw error(404, 'Fulfilment case not found');
	const { supabase, profile } = await requireActiveStaff(event);
	return { detail: await loadFulfilmentDetail(supabase, event.params.id), profile };
};

export const actions: Actions = {
	createStep: async (event) =>
		runMutation(event, 'Could not create Fulfilment work', async (form, id) => {
			const type = formText(form, 'type');
			if (!['installation', 'courier', 'pickup'].includes(type)) {
				throw new Error('Choose an installation, courier, or pickup step');
			}
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('create_fulfilment_step', {
				p_fulfilment_case_id: id,
				p_type: type,
				p_lock_version: formLockVersion(form, 'FulfilmentCase'),
				p_notes: optionalText(form, 'notes'),
				p_tracking_reference: optionalText(form, 'tracking_reference')
			});
		}),
	schedule: async (event) =>
		runMutation(event, 'Could not schedule installation', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('schedule_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep'),
				p_scheduled_for: formDateTime(form, 'scheduled_for')
			});
		}),
	reschedule: async (event) =>
		runMutation(event, 'Could not reschedule installation', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('reschedule_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep'),
				p_scheduled_for: formDateTime(form, 'scheduled_for')
			});
		}),
	dispatch: async (event) =>
		runMutation(event, 'Could not dispatch courier work', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('dispatch_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep'),
				p_tracking_reference: optionalText(form, 'tracking_reference'),
				p_notes: optionalText(form, 'notes')
			});
		}),
	ready: async (event) =>
		runMutation(event, 'Could not mark pickup ready', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('ready_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep'),
				p_notes: optionalText(form, 'notes')
			});
		}),
	completeStep: async (event) =>
		runMutation(event, 'Could not complete Fulfilment work', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('complete_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep')
			});
		}),
	cancelStep: async (event) =>
		runMutation(event, 'Could not cancel Fulfilment work', async (form) => {
			const reason = formText(form, 'reason');
			if (!reason) throw new Error('Step cancellation reason is required');
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('cancel_fulfilment_step', {
				p_step_id: formUuid(form, 'step_id', 'FulfilmentStep ID'),
				p_lock_version: formLockVersion(form, 'FulfilmentStep'),
				p_reason: reason
			});
		}),
	requestPayment: async (event) =>
		runMutation(event, 'Could not request payment evidence', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('request_payment_milestone', {
				p_payment_milestone_id: formUuid(form, 'payment_milestone_id', 'PaymentMilestone ID'),
				p_lock_version: formLockVersion(form, 'PaymentMilestone')
			});
		}),
	receivePayment: async (event) =>
		runMutation(event, 'Could not record payment evidence', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('record_payment_received', {
				p_payment_milestone_id: formUuid(form, 'payment_milestone_id', 'PaymentMilestone ID'),
				p_lock_version: formLockVersion(form, 'PaymentMilestone'),
				p_note: optionalText(form, 'note')
			});
		}),
	notRequired: async (event) =>
		runMutation(event, 'Could not mark payment not required', async (form) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('mark_payment_not_required', {
				p_payment_milestone_id: formUuid(form, 'payment_milestone_id', 'PaymentMilestone ID'),
				p_lock_version: formLockVersion(form, 'PaymentMilestone'),
				p_note: optionalText(form, 'note')
			});
		}),
	correctPayment: async (event) =>
		runMutation(
			event,
			'Could not correct payment evidence',
			async (form) => {
				const status = formText(form, 'status');
				if (!['awaiting', 'received', 'not_required'].includes(status)) {
					throw new Error('Choose a valid corrected payment status');
				}
				const reason = formText(form, 'reason');
				if (!reason) throw new Error('Payment correction reason is required');
				const { supabase } = await requireActiveStaff(event);
				return supabase.rpc('correct_payment_milestone', {
					p_payment_milestone_id: formUuid(form, 'payment_milestone_id', 'PaymentMilestone ID'),
					p_lock_version: formLockVersion(form, 'PaymentMilestone'),
					p_status: status,
					p_reason: reason,
					p_note: optionalText(form, 'note')
				});
			},
			true
		),
	followUp: async (event) =>
		runMutation(event, 'Could not create payment follow-up', async (form, id) => {
			const title = formText(form, 'title');
			if (!title) throw new Error('Payment follow-up title is required');
			const dueAt = formText(form, 'due_at');
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('create_task', {
				p_fulfilment_case_id: id,
				p_type: 'payment_follow_up',
				p_title: title,
				p_description: optionalText(form, 'description'),
				...(dueAt ? { p_due_at: formDateTime(form, 'due_at') } : {})
			} as never);
		}),
	completeCase: async (event) =>
		runMutation(event, 'Could not complete Fulfilment case', async (form, id) => {
			const { supabase } = await requireActiveStaff(event);
			return supabase.rpc('complete_fulfilment', {
				p_fulfilment_case_id: id,
				p_lock_version: formLockVersion(form, 'FulfilmentCase')
			});
		}),
	cancelCase: async (event) =>
		runMutation(
			event,
			'Could not cancel Fulfilment case',
			async (form, id) => {
				const reason = formText(form, 'reason');
				if (!reason) throw new Error('Fulfilment cancellation reason is required');
				const { supabase } = await requireActiveStaff(event);
				return supabase.rpc('cancel_fulfilment', {
					p_fulfilment_case_id: id,
					p_lock_version: formLockVersion(form, 'FulfilmentCase'),
					p_reason: reason
				});
			},
			true
		)
};
