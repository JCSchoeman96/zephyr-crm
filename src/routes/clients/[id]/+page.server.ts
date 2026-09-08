import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { localDateTimeToIso } from '$lib/time/zoned-datetime';
import { requireActiveStaff } from '$lib/server/require-auth';

function required(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

function optional(form: FormData, name: string): string | undefined {
	const value = required(form, name);
	return value || undefined;
}

function lockVersion(form: FormData): number {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid Client lock_version is required');
	return value;
}

function contactLockVersion(form: FormData): number {
	const value = Number(form.get('contact_lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid ClientContact lock_version is required');
	return value;
}

function uuid(form: FormData, name: string): string {
	const value = required(form, name);
	if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`A valid ${name} is required`);
	return value;
}

function formDateTime(form: FormData, name: string) {
	const value = required(form, name);
	if (!value) return undefined;
	const { configuration } = loadTrustedClientConfiguration();
	return localDateTimeToIso(value, configuration.locale.timezone);
}

function formValues(form: FormData): Record<string, string> {
	const names = [
		'lock_version',
		'type',
		'display_name',
		'company_name',
		'email',
		'phone',
		'tax_number',
		'registration_number',
		'billing_address_line_1',
		'billing_address_line_2',
		'billing_city',
		'billing_region',
		'billing_postal_code',
		'billing_country',
		'status',
		'reason',
		'contact_id',
		'contact_lock_version',
		'first_name',
		'last_name',
		'job_title'
	];
	return Object.fromEntries(
		names.filter((name) => form.has(name)).map((name) => [name, String(form.get(name) ?? '')])
	);
}

function failure(cause: unknown, fallback: string, values?: Record<string, string>) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code, values });
}

function canMutate(role: string): boolean {
	return role !== 'viewer';
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const clientResponse = await supabase
		.from('clients')
		.select('*')
		.eq('id', event.params.id)
		.maybeSingle();
	if (clientResponse.error) throw error(500, 'Could not load customer details');
	if (!clientResponse.data) throw error(404, 'Customer not found');

	const [
		contactsResponse,
		activityResponse,
		sourceLeadResponse,
		sourceLeadActivitiesResponse,
		quotesResponse,
		fulfilmentsResponse,
		tasksResponse
	] = await Promise.all([
		supabase
			.from('client_contacts')
			.select('*')
			.eq('client_id', event.params.id)
			.order('is_primary', { ascending: false })
			.order('created_at', { ascending: true })
			.limit(100),
		supabase
			.from('activities')
			.select('*')
			.eq('client_id', event.params.id)
			.order('occurred_at', { ascending: false })
			.limit(100),
		clientResponse.data.source_lead_id
			? supabase
					.from('leads')
					.select('id,lead_number,first_name,last_name,email,company,pipeline_stage')
					.eq('id', clientResponse.data.source_lead_id)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		clientResponse.data.source_lead_id
			? supabase
					.from('activities')
					.select('*')
					.eq('lead_id', clientResponse.data.source_lead_id)
					.order('occurred_at', { ascending: false })
					.limit(100)
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('quotes')
			.select('id,quote_number,subject,status,updated_at')
			.eq('client_id', event.params.id)
			.order('updated_at', { ascending: false })
			.limit(20),
		supabase
			.from('fulfilment_cases')
			.select('id,fulfilment_number,status,updated_at')
			.eq('client_id', event.params.id)
			.order('updated_at', { ascending: false })
			.limit(20),
		supabase
			.from('tasks')
			.select('id,title,type,status,due_at')
			.eq('client_id', event.params.id)
			.order('created_at', { ascending: false })
			.limit(20)
	]);

	if (
		contactsResponse.error ||
		activityResponse.error ||
		sourceLeadResponse.error ||
		sourceLeadActivitiesResponse.error ||
		quotesResponse.error ||
		fulfilmentsResponse.error ||
		tasksResponse.error
	) {
		throw error(500, 'Could not load customer history');
	}

	return {
		client: clientResponse.data,
		contacts: contactsResponse.data ?? [],
		activities: activityResponse.data ?? [],
		sourceLeadActivities: sourceLeadActivitiesResponse.data ?? [],
		sourceLead: sourceLeadResponse.data,
		quotes: quotesResponse.data ?? [],
		fulfilments: fulfilmentsResponse.data ?? [],
		tasks: tasksResponse.data ?? [],
		profile
	};
};

export const actions: Actions = {
	update: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const displayName = required(form, 'display_name');
			if (!displayName) throw new Error('Customer display name is required');
			const response = await supabase.rpc('update_client_details', {
				p_client_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_type: required(form, 'type'),
				p_display_name: displayName,
				p_company_name: optional(form, 'company_name'),
				p_email: optional(form, 'email'),
				p_phone: optional(form, 'phone'),
				p_tax_number: optional(form, 'tax_number'),
				p_registration_number: optional(form, 'registration_number'),
				p_billing_address_line_1: optional(form, 'billing_address_line_1'),
				p_billing_address_line_2: optional(form, 'billing_address_line_2'),
				p_billing_city: optional(form, 'billing_city'),
				p_billing_region: optional(form, 'billing_region'),
				p_billing_postal_code: optional(form, 'billing_postal_code'),
				p_billing_country: optional(form, 'billing_country')
			});
			if (response.error) return failure(response.error, 'Could not update customer', values);
		} catch (actionError) {
			return failure(actionError, 'Could not update customer', values);
		}
		throw redirect(303, `/clients/${event.params.id}`);
	},
	status: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const status = required(form, 'status');
			if (!['active', 'inactive', 'archived'].includes(status))
				throw new Error('Customer status is invalid');
			const response = await supabase.rpc('set_client_status', {
				p_client_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_status: status,
				p_reason: optional(form, 'reason')
			});
			if (response.error)
				return failure(response.error, 'Could not change customer status', values);
		} catch (actionError) {
			return failure(actionError, 'Could not change customer status', values);
		}
		throw redirect(303, `/clients/${event.params.id}`);
	},
	followUp: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		try {
			const title = required(form, 'title');
			if (!title) throw new Error('A follow-up title is required');
			const dueAt = formDateTime(form, 'due_at');
			const assignedTo = optional(form, 'assigned_to');
			const response = await supabase.rpc('create_task', {
				p_client_id: event.params.id,
				p_type: optional(form, 'type') || 'follow_up',
				p_title: title,
				p_description: optional(form, 'description'),
				...(dueAt ? { p_due_at: dueAt } : {}),
				...(assignedTo ? { p_assigned_to: assignedTo } : {})
			});
			if (response.error) return failure(response.error, 'Could not create follow-up');
		} catch (actionError) {
			return failure(actionError, 'Could not create follow-up');
		}
		throw redirect(303, `/clients/${event.params.id}#related`);
	},
	contactCreate: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const firstName = required(form, 'first_name');
			if (!firstName) throw new Error('Contact first name is required');
			const response = await supabase.rpc('create_client_contact', {
				p_client_id: event.params.id,
				p_first_name: firstName,
				p_last_name: optional(form, 'last_name'),
				p_email: optional(form, 'email'),
				p_phone: optional(form, 'phone'),
				p_job_title: optional(form, 'job_title'),
				p_is_primary: form.get('is_primary') === 'on'
			});
			if (response.error) return failure(response.error, 'Could not create customer contact');
		} catch (actionError) {
			return failure(actionError, 'Could not create customer contact');
		}
		throw redirect(303, `/clients/${event.params.id}#contacts`);
	},
	contactUpdate: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const firstName = required(form, 'first_name');
			if (!firstName) throw new Error('Contact first name is required');
			const response = await supabase.rpc('update_client_contact', {
				p_contact_id: uuid(form, 'contact_id'),
				p_lock_version: contactLockVersion(form),
				p_first_name: firstName,
				p_last_name: optional(form, 'last_name'),
				p_email: optional(form, 'email'),
				p_phone: optional(form, 'phone'),
				p_job_title: optional(form, 'job_title')
			});
			if (response.error) return failure(response.error, 'Could not update customer contact');
		} catch (actionError) {
			return failure(actionError, 'Could not update customer contact');
		}
		throw redirect(303, `/clients/${event.params.id}#contacts`);
	},
	contactPrimary: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('set_primary_client_contact', {
				p_contact_id: uuid(form, 'contact_id'),
				p_lock_version: contactLockVersion(form)
			});
			if (response.error)
				return failure(response.error, 'Could not change the primary customer contact');
		} catch (actionError) {
			return failure(actionError, 'Could not change the primary customer contact');
		}
		throw redirect(303, `/clients/${event.params.id}#contacts`);
	},
	contactStatus: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canMutate(profile.role)) return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const status = required(form, 'status');
			if (!['active', 'inactive'].includes(status)) throw new Error('Contact status is invalid');
			const response = await supabase.rpc('set_client_contact_status', {
				p_contact_id: uuid(form, 'contact_id'),
				p_lock_version: contactLockVersion(form),
				p_status: status,
				p_reason: optional(form, 'reason')
			});
			if (response.error)
				return failure(response.error, 'Could not change customer contact status');
		} catch (actionError) {
			return failure(actionError, 'Could not change customer contact status');
		}
		throw redirect(303, `/clients/${event.params.id}#contacts`);
	}
};
