import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const { parseClientConfiguration } = await import('../src/lib/config/client-config.ts');
const configFile =
	process.argv.find((argument) => argument.endsWith('.json')) ??
	process.env.CLIENT_CONFIG_FILE ??
	'config/client.example.json';

function run(command, args, options = {}) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...options
		}).trim();
	} catch (error) {
		throw new Error(`${command} failed during local provisioning.`, { cause: error });
	}
}

function statusEnv() {
	const output = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		output
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
	return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function assertLocalEndpoint(value, label) {
	if (!value) return;
	try {
		const url = new URL(value);
		if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
			throw new Error(`${label} is not a local endpoint.`);
		}
	} catch (error) {
		if (error instanceof Error && error.message.endsWith('is not a local endpoint.')) throw error;
		throw new Error(`${label} must be a local endpoint for this command.`, { cause: error });
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const input = JSON.parse(readFileSync(configFile, 'utf8'));
const configuration = parseClientConfiguration(input);
const ownerEmail = process.env.PROVISION_OWNER_EMAIL?.trim().toLowerCase();
const ownerPassword = process.env.PROVISION_OWNER_PASSWORD ?? '';
assert(
	ownerEmail,
	'PROVISION_OWNER_EMAIL is required and is never read from source-controlled configuration.'
);
assert(ownerPassword.length >= 12, 'PROVISION_OWNER_PASSWORD must contain at least 12 characters.');

for (const [key, label] of [
	['SUPABASE_URL', 'SUPABASE_URL'],
	['CLIENT_DATABASE_URL', 'CLIENT_DATABASE_URL'],
	['BACKUP_DATABASE_URL', 'BACKUP_DATABASE_URL'],
	['BACKUP_RESTORE_DATABASE_URL', 'BACKUP_RESTORE_DATABASE_URL']
]) {
	assertLocalEndpoint(process.env[key], label);
}

if (process.env.CLIENT_PROVISION_RESET === 'true') {
	// The reset path is deliberately opt-in and only runs after the endpoint checks above.
	run('bun', ['run', 'db:reset']);
}

const local = statusEnv();
const apiUrl = local.API_URL;
const serviceRoleKey = local.SERVICE_ROLE_KEY;
const databaseUrl = local.DB_URL;
assertLocalEndpoint(apiUrl, 'Local Supabase API_URL');
assert(
	apiUrl && serviceRoleKey && databaseUrl,
	'Local Supabase status is missing a required provisioning endpoint.'
);

async function jsonResponse(response) {
	const body = await response.text();
	try {
		return body ? JSON.parse(body) : null;
	} catch {
		return null;
	}
}

async function authAdmin(path, init = {}) {
	const response = await fetch(`${apiUrl}/auth/v1/admin${path}`, {
		...init,
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			...(init.headers ?? {})
		}
	});
	const body = await jsonResponse(response);
	return { response, body };
}

async function findOrCreateOwner() {
	const created = await authAdmin('/users', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email: ownerEmail,
			password: ownerPassword,
			email_confirm: true,
			user_metadata: { full_name: configuration.brand.companyName }
		})
	});
	if (created.response.ok && created.body?.id) return created.body.id;

	const listed = await authAdmin('/users?page=1&per_page=1000');
	const users = Array.isArray(listed.body?.users) ? listed.body.users : [];
	const existing = users.find((user) => String(user.email ?? '').toLowerCase() === ownerEmail);
	assert(existing?.id, 'Could not create or locate the deterministic local Owner account.');

	const updated = await authAdmin(`/users/${existing.id}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			password: ownerPassword,
			email_confirm: true,
			user_metadata: { full_name: configuration.brand.companyName }
		})
	});
	assert(updated.response.ok, 'Could not refresh the deterministic local Owner account.');
	return existing.id;
}

async function provisionOwner(userId) {
	const response = await fetch(`${apiUrl}/rest/v1/rpc/provision_invited_profile`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ p_user_id: userId, p_role: 'owner', p_status: 'active' })
	});
	assert(response.ok, 'Trusted Owner profile provisioning failed.');
}

function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function applySettings(ownerId) {
	const companyIdentity = {
		name: configuration.brand.companyName,
		logo_path: configuration.brand.logoPath,
		brand_tokens: {
			primary: configuration.brand.colors.primary,
			primary_strong: configuration.brand.colors.primaryStrong,
			accent: configuration.brand.colors.accent
		}
	};
	const locale = {
		language: configuration.locale.language,
		timezone: configuration.locale.timezone,
		currency: configuration.locale.currency,
		date_format: configuration.locale.dateFormat
	};
	const quoteDefaults = {
		prefix: configuration.quotes.prefix,
		tax_label: configuration.quotes.taxLabel,
		tax_rate: configuration.quotes.taxRate,
		validity_days: configuration.quotes.defaultValidityDays,
		terms: configuration.quotes.terms,
		bank_details: configuration.quotes.bankDetails
	};
	const salesRules = {
		follow_up_days: configuration.sales.followUpDays,
		stale_lead_days: configuration.sales.staleLeadDays,
		default_owner_email: configuration.sales.defaultOwnerEmail
	};
	const emailDefaults = {
		sender_email: configuration.email.senderEmail,
		sender_name: configuration.email.senderName,
		reply_to: configuration.email.replyTo,
		template_ids: configuration.email.templateIds
	};
	const integrationIdentifiers = {
		bricks_form_id: configuration.integrations.bricks.formId,
		sendpulse_api_base_url: configuration.integrations.sendpulse.apiBaseUrl,
		sendpulse_sender_domain: configuration.integrations.sendpulse.senderDomain,
		sendpulse_template_ids: configuration.integrations.sendpulse.templateIds
	};
	const quoteDescription = 'Non-secret commercial defaults for new quotes';
	const query = `
insert into public.app_settings (setting_key, setting_value, description)
values
	('company_identity', ${jsonLiteral(companyIdentity)}, 'Non-secret company identity and client brand tokens'),
	('locale', ${jsonLiteral(locale)}, 'Presentation and scheduling defaults'),
	('quote_defaults', ${jsonLiteral(quoteDefaults)}, ${sqlLiteral(quoteDescription)}),
	('sales_rules', ${jsonLiteral(salesRules)}, 'Lead follow-up and stale-opportunity rules'),
	('email_defaults', ${jsonLiteral(emailDefaults)}, 'Non-secret sender identity and message template identifiers'),
	('integration_identifiers', ${jsonLiteral(integrationIdentifiers)}, 'Non-secret external integration identifiers'),
	('owner_user', ${jsonLiteral({ profile_id: ownerId, email: ownerEmail, provisioning: 'local-template' })}, 'Owner assigned through trusted local provisioning')
on conflict (setting_key) do update
set setting_value = excluded.setting_value, description = excluded.description;
update public.app_settings
set setting_value = setting_value || ${jsonLiteral({
		follow_up_days: configuration.sales.followUpDays,
		stale_opportunity_days: configuration.sales.staleLeadDays
	})}
where setting_key = 'automation_rules';
`;
	sql(query);
}

const ownerId = await findOrCreateOwner();
await provisionOwner(ownerId);
applySettings(ownerId);

const settings = sql(
	"select string_agg(setting_key, ',' order by setting_key) from public.app_settings where setting_key in ('company_identity','locale','quote_defaults','sales_rules','email_defaults','integration_identifiers','owner_user')"
);
assert(
	settings ===
		'company_identity,email_defaults,integration_identifiers,locale,owner_user,quote_defaults,sales_rules',
	'Local provisioning did not apply the complete client settings set.'
);

console.log(
	JSON.stringify({
		status: 'PROVISIONED_LOCAL',
		configurationVersion: configuration.version,
		ownerProfileId: ownerId,
		settingsApplied: settings.split(','),
		reset: process.env.CLIENT_PROVISION_RESET === 'true'
	})
);
