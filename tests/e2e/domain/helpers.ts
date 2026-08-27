import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

export const appUrl = 'http://127.0.0.1:4173';
export const bricksSecret = 'p14-browser-bricks-secret';

type AdminUserResponse = { id: string };
type AuthTokenResponse = { access_token?: string };
type BricksResponse = { lead_id?: string };
type LeadRecord = {
	id: string;
	lock_version: number;
	pipeline_stage?: string;
	qualification_notes?: string | null;
	lost_reason_id?: string | null;
	lost_notes?: string | null;
};
type ClientRecord = {
	id: string;
	lock_version?: number;
	status?: string;
	source_lead_id?: string;
	display_name?: string;
};
type QuoteRecord = {
	id?: string;
	status?: string;
	total?: string | number;
	document_path?: string | null;
};
type LostReason = { id: string; code?: string; label?: string };

function localSupabaseEnvironment(): Record<string, string> {
	try {
		const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		return Object.fromEntries(
			output
				.split('\n')
				.filter((line) => line.includes('='))
				.map((line) => {
					const separator = line.indexOf('=');
					return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
				})
		);
	} catch {
		return {};
	}
}

const local = localSupabaseEnvironment();
export const apiUrl = process.env.SUPABASE_URL ?? local.API_URL ?? '';
const anonKey =
	process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? local.ANON_KEY ?? local.PUBLISHABLE_KEY ?? '';
export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? local.SERVICE_ROLE_KEY ?? '';
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
let staffSequence = 0;

export type StaffUser = { id: string; email: string; password: string; accessToken: string };

async function jsonBody<T = unknown>(response: Response): Promise<T> {
	const body = await response.text();
	if (!body) return null as T;
	try {
		return JSON.parse(body) as T;
	} catch {
		return body as T;
	}
}

function base32Decode(secret: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	const normalized = secret.toUpperCase().replaceAll('=', '').replaceAll(' ', '');
	let buffer = 0;
	let bits = 0;
	const bytes: number[] = [];
	for (const character of normalized) {
		const value = alphabet.indexOf(character);
		if (value < 0) throw new Error('TOTP secret contains an unsupported character');
		buffer = (buffer << 5) | value;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >>> bits) & 0xff);
		}
	}
	return Buffer.from(bytes);
}

function totp(secret: string, timestamp = Date.now()): string {
	const counter = Math.floor(timestamp / 1000 / 30);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeBigUInt64BE(BigInt(counter));
	const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const code =
		((digest[offset] & 0x7f) << 24) |
		((digest[offset + 1] & 0xff) << 16) |
		((digest[offset + 2] & 0xff) << 8) |
		(digest[offset + 3] & 0xff);
	return String(code % 1_000_000).padStart(6, '0');
}

function assertConfigured() {
	if (!apiUrl || !serviceRoleKey) {
		throw new Error('P14 browser tests require a running local Supabase instance.');
	}
}

export async function serviceRequest<T = unknown>(
	path: string,
	init: RequestInit = {}
): Promise<T> {
	assertConfigured();
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			...(init.headers ?? {})
		}
	});
	const body = await jsonBody<T>(response);
	if (!response.ok)
		throw new Error(`Local Supabase request failed (${response.status}): ${JSON.stringify(body)}`);
	return body;
}

export async function createStaff(
	role: 'owner' | 'admin' | 'sales' | 'viewer' = 'owner',
	label: string = role
): Promise<StaffUser> {
	assertConfigured();
	const sequence = ++staffSequence;
	const email = `p14-browser-${runId}-${sequence}-${label}@example.test`;
	const password = `P14-${runId}-${sequence}-${role}-BrowserPassword9!`;
	const user = await serviceRequest<AdminUserResponse>('/auth/v1/admin/users', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: `P14 ${label}` }
		})
	});
	await serviceRequest('/rest/v1/rpc/provision_invited_profile', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ p_user_id: user.id, p_role: role, p_status: 'active' })
	});
	const sessionResponse = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: anonKey, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const session = await jsonBody<AuthTokenResponse>(sessionResponse);
	if (!sessionResponse.ok || !session?.access_token)
		throw new Error(
			`Local Auth sign-in failed (${sessionResponse.status}): ${JSON.stringify(session)}`
		);
	return { id: user.id, email, password, accessToken: session.access_token };
}

export async function signIn(page: Page, user: StaffUser): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Email address').fill(user.email);
	await page.getByLabel('Password').fill(user.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL(/\/$/);
}

export async function signInWithAal2(page: Page, user: StaffUser): Promise<void> {
	assertConfigured();
	const client = createClient(apiUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const signedIn = await client.auth.signInWithPassword({
		email: user.email,
		password: user.password
	});
	if (signedIn.error || !signedIn.data.session) {
		throw new Error(`AAL2 fixture sign-in failed: ${signedIn.error?.message ?? 'missing session'}`);
	}
	const enrolled = await client.auth.mfa.enroll({
		factorType: 'totp',
		friendlyName: `P14 browser ${user.email}`
	});
	if (enrolled.error || !enrolled.data?.id || !enrolled.data.totp?.secret) {
		throw new Error(
			`AAL2 fixture enrollment failed: ${enrolled.error?.message ?? 'missing factor'}`
		);
	}
	const verified = await client.auth.mfa.challengeAndVerify({
		factorId: enrolled.data.id,
		code: totp(enrolled.data.totp.secret)
	});
	if (verified.error)
		throw new Error(`AAL2 fixture verification failed: ${verified.error.message}`);
	const sessionResponse = await client.auth.getSession();
	const session = sessionResponse.data.session;
	if (sessionResponse.error || !session?.access_token) {
		throw new Error(
			`AAL2 fixture session was not available: ${sessionResponse.error?.message ?? 'missing session'}`
		);
	}
	const verifiedUserResponse = await fetch(`${apiUrl}/auth/v1/user`, {
		headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` }
	});
	if (!verifiedUserResponse.ok) {
		throw new Error(`AAL2 fixture token was rejected by Auth (${verifiedUserResponse.status}).`);
	}

	const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;
	for (const cookie of await page.context().cookies(appUrl)) {
		if (cookie.name === storageKey || cookie.name.startsWith(`${storageKey}.`)) {
			await page.context().clearCookies({ name: cookie.name });
		}
	}
	const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
	const chunkSize = 3180;
	const values =
		encoded.length <= 3800
			? [encoded]
			: Array.from({ length: Math.ceil(encoded.length / chunkSize) }, (_, index) =>
					encoded.slice(index * chunkSize, (index + 1) * chunkSize)
				);
	await page.context().addCookies(
		values.map((value, index) => ({
			name: values.length === 1 ? storageKey : `${storageKey}.${index}`,
			value,
			domain: '127.0.0.1',
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'Lax' as const
		}))
	);
}

async function authenticatedRequest<T = unknown>(path: string, user: StaffUser): Promise<T> {
	return authenticatedRequestWithInit<T>(path, user);
}

async function authenticatedRequestWithInit<T = unknown>(
	path: string,
	user: StaffUser,
	init: RequestInit = {}
): Promise<T> {
	assertConfigured();
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: anonKey,
			Authorization: `Bearer ${user.accessToken}`,
			...(init.headers ?? {})
		}
	});
	const body = await jsonBody<T>(response);
	if (!response.ok)
		throw new Error(
			`Authenticated local Supabase request failed (${response.status}): ${JSON.stringify(body)}`
		);
	return body;
}

export async function authenticatedRpc(
	name: string,
	args: Record<string, unknown>,
	user: StaffUser
): Promise<unknown> {
	return authenticatedRequestWithInit(`/rest/v1/rpc/${name}`, user, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(args)
	});
}

export async function createConvertedClientFixture(label: string): Promise<{
	owner: StaffUser;
	lead: { id: string; email: string; externalId: string };
	client: ClientRecord;
}> {
	const owner = await createStaff('owner', `${label}-owner`);
	const lead = await ingestLead(`${label}-client`);
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await readLead(lead.id, owner);
		if (!current) throw new Error('Could not read the browser Lead fixture.');
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: current.lock_version },
			owner
		);
	}
	const latest = await readLead(lead.id, owner);
	if (!latest) throw new Error('Could not read the converted browser Lead fixture.');
	await authenticatedRpc(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: latest.lock_version },
		owner
	);
	const client = await readClientForLead(lead.id, owner);
	if (!client?.id) throw new Error('Could not create the browser Client fixture.');
	return { owner, lead, client };
}

export async function cleanupUser(userId: string): Promise<void> {
	if (!apiUrl || !serviceRoleKey) return;
	await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
		method: 'DELETE',
		headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
	}).catch(() => {});
}

export async function ingestLead(
	label: string
): Promise<{ id: string; email: string; externalId: string }> {
	const email = `p14-${label}-${runId}@example.test`;
	const externalId = randomUUID();
	const response = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			form_id: 'contact-form',
			external_submission_id: externalId,
			first_name: 'P14',
			last_name:
				label === 'won' ? 'Browser Won' : label === 'lost' ? 'Browser Lost' : 'Browser Harness',
			email,
			phone: '+27110000000',
			company: `P14 ${label} Company`,
			message: `P14 ${label} browser journey`,
			source: 'bricks'
		})
	});
	const body = await jsonBody<BricksResponse>(response);
	if (response.status !== 201 || !body?.lead_id) {
		throw new Error(`Bricks browser intake failed (${response.status}): ${JSON.stringify(body)}`);
	}
	return { id: body.lead_id, email, externalId };
}

export async function readLead(id: string, user: StaffUser): Promise<LeadRecord | undefined> {
	return authenticatedRequest<LeadRecord[]>(
		`/rest/v1/leads?id=eq.${id}&select=*&limit=1`,
		user
	).then((rows) => rows?.[0]);
}

export async function readClientForLead(
	leadId: string,
	user: StaffUser
): Promise<ClientRecord | undefined> {
	return authenticatedRequest<ClientRecord[]>(
		`/rest/v1/clients?source_lead_id=eq.${leadId}&select=*&limit=1`,
		user
	).then((rows) => rows?.[0]);
}

export async function readQuotesForLead(leadId: string, user: StaffUser): Promise<QuoteRecord[]> {
	return authenticatedRequest<QuoteRecord[]>(
		`/rest/v1/quotes?lead_id=eq.${leadId}&select=*&order=created_at.desc`,
		user
	);
}

export async function readClientContacts(
	clientId: string,
	user: StaffUser
): Promise<Array<{ id: string; is_primary: boolean; status: string }>> {
	return authenticatedRequest(
		`/rest/v1/client_contacts?client_id=eq.${clientId}&select=id,is_primary,status&order=created_at.asc`,
		user
	);
}

export async function readFulfilmentCasesForQuote(
	quoteId: string,
	user: StaffUser
): Promise<Array<{ id: string; client_id: string; lead_id: string; accepted_quote_id: string }>> {
	return authenticatedRequest(
		`/rest/v1/fulfilment_cases?accepted_quote_id=eq.${quoteId}&select=id,client_id,lead_id,accepted_quote_id`,
		user
	);
}

export async function lostReasonId(user: StaffUser): Promise<string> {
	const rows = await authenticatedRequest<LostReason[]>(
		'/rest/v1/lost_reasons?active=eq.true&select=id,label,code&order=sort_order.asc&limit=1',
		user
	);
	if (!rows?.[0]?.id) throw new Error('No active local lost reason is available.');
	return rows[0].id;
}

export async function lostReasonByCode(code: string, user: StaffUser): Promise<string> {
	const rows = await authenticatedRequest<LostReason[]>(
		`/rest/v1/lost_reasons?active=eq.true&code=eq.${encodeURIComponent(code)}&select=id,code`,
		user
	);
	if (!rows?.[0]?.id) throw new Error(`No active local lost reason exists for ${code}.`);
	return rows[0].id;
}

export async function readLeadActivities(
	leadId: string,
	user: StaffUser
): Promise<Array<{ event_type: string; summary?: string }>> {
	return authenticatedRequest(
		`/rest/v1/activities?lead_id=eq.${leadId}&select=event_type,summary&order=occurred_at.asc`,
		user
	);
}

export async function cleanupLead(id: string, userId: string): Promise<void> {
	if (!apiUrl || !serviceRoleKey) return;
	const paths = [
		`/rest/v1/outbound_messages?lead_id=eq.${id}`,
		`/rest/v1/fulfilment_cases?lead_id=eq.${id}`,
		`/rest/v1/clients?source_lead_id=eq.${id}`,
		`/rest/v1/leads?id=eq.${id}`,
		`/auth/v1/admin/users/${userId}`
	];
	for (const path of paths) {
		await fetch(`${apiUrl}${path}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		}).catch(() => {});
	}
}
