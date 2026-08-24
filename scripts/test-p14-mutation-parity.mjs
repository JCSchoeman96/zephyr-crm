import { readFileSync } from 'node:fs';

function read(path) {
	return readFileSync(path, 'utf8');
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const trustedMutation = read(
	'supabase/migrations/20260824100000_p14_client_task_trusted_mutations.sql'
);
const leadAndOutboundLaw = read(
	'supabase/migrations/20260822160000_v131_authority_reconciliation.sql'
);
const identityLaw = read(
	'supabase/migrations/20260821194640_database_identity_permissions_rls.sql'
);
const quoteLaw = read('supabase/migrations/20260821220000_quote_domain_hardening.sql');
const clientRoute = read('src/routes/clients/[id]/+page.server.ts');
const taskRoute = read('src/routes/tasks/+page.server.ts');

assert(
	leadAndOutboundLaw.includes('private.allow_outbound_attempt_mutation'),
	'Lead, Activity, or outbound trusted boundaries are missing.'
);
const protectedTableRevocations = [
	'revoke insert, update, delete on table public.clients from authenticated;',
	'revoke insert, update, delete on table public.client_contacts from authenticated;',
	'revoke insert, update, delete on table public.tasks from authenticated;',
	'revoke insert, update, delete on table public.quotes from authenticated;',
	'revoke insert, update, delete on table public.quote_items from authenticated;'
];
assert(
	protectedTableRevocations.every(
		(statement) => trustedMutation.includes(statement) || quoteLaw.includes(statement)
	),
	'Current-schema Client/Contact/Task/Quote table mutation grants are not fully revoked.'
);
assert(
	leadAndOutboundLaw.includes('alter function public.transition_lead') &&
		leadAndOutboundLaw.includes('alter function public.convert_lead') &&
		leadAndOutboundLaw.includes('private.allow_outbound_attempt_mutation') &&
		identityLaw.includes('private.prevent_activity_mutation'),
	'Lead, Activity, or outbound trusted boundaries are missing.'
);
assert(
	quoteLaw.includes('create or replace function public.save_quote_draft') &&
		quoteLaw.includes('security definer') &&
		quoteLaw.includes('create or replace function public.prepare_quote_send'),
	'Quote mutations are not represented by trusted functions.'
);
assert(
	trustedMutation.includes('create or replace function public.update_client_details') &&
		trustedMutation.includes('create or replace function public.set_client_status') &&
		trustedMutation.includes('create or replace function public.create_client_contact') &&
		trustedMutation.includes('create or replace function public.create_task') &&
		trustedMutation.includes('security definer'),
	'Client, Contact, and Task trusted mutation functions are incomplete.'
);
assert(
	clientRoute.includes("supabase.rpc('update_client_details'") &&
		clientRoute.includes("supabase.rpc('set_client_status'") &&
		clientRoute.includes("supabase.rpc('create_client_contact'") &&
		!clientRoute.includes(".from('clients').insert") &&
		!clientRoute.includes(".from('clients').update") &&
		!clientRoute.includes(".from('client_contacts').insert"),
	'Client UI mutation actions do not preserve the trusted RPC boundary.'
);
assert(
	taskRoute.includes("supabase.rpc('create_task'") &&
		taskRoute.includes('p_lead_id') &&
		taskRoute.includes('p_client_id') &&
		taskRoute.includes('p_quote_id') &&
		!taskRoute.includes(".from('tasks').insert") &&
		!taskRoute.includes(".from('tasks').update"),
	'Task UI mutation actions do not preserve the trusted RPC boundary.'
);

console.log('P14-T35 trusted-mutation boundary parity passed');
