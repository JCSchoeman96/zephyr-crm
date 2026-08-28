import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
	anonKey,
	assert,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRoleKey,
	serviceRows,
	signIn
} from './p14-test-utils.mjs';

const migrationPath = 'supabase/migrations/20260828120000_v150_quote_builder.sql';
const baselineCommit = '6baf80c';
const users = [];

function expectMigrationOnly() {
	if (!existsSync(migrationPath)) {
		throw new Error('Missing P24 migration ' + migrationPath);
	}
	const migration = readFileSync(migrationPath, 'utf8');
	if ((migration.match(/^begin;$/gm) ?? []).length !== 1) {
		throw new Error('P24 migration must begin one transaction');
	}
	if ((migration.match(/^commit;$/gm) ?? []).length !== 1) {
		throw new Error('P24 migration must commit one transaction');
	}
	const changedMigrations = execFileSync(
		'git',
		['diff', '--name-only', baselineCommit + '..HEAD', '--', 'supabase/migrations'],
		{ cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	)
		.trim()
		.split(/\r?\n/)
		.filter(Boolean);
	const historicalChanges = changedMigrations.filter((path) => path !== migrationPath);
	if (historicalChanges.length > 0) {
		throw new Error('Historical migrations changed: ' + historicalChanges.join(', '));
	}
}

async function expectRpcFailure(name, args, user, label) {
	const result = await rpc(name, args, anonKey, await signIn(user));
	assert(!result.response.ok, label + ' unexpectedly succeeded: ' + JSON.stringify(result.body));
	return result;
}

async function row(path, user, label) {
	const rows = await serviceRows(path, user);
	assert(rows.length === 1, label + ' was not returned exactly once');
	return rows[0];
}

async function leadById(id, user) {
	return row('/rest/v1/leads?id=eq.' + id + '&select=*', user, 'Lead ' + id);
}

async function quoteById(id, user) {
	return row('/rest/v1/quotes?id=eq.' + id + '&select=*', user, 'Quote ' + id);
}

async function productById(id, user) {
	return row('/rest/v1/products?id=eq.' + id + '&select=*', user, 'Product ' + id);
}

async function itemsByQuote(id, user) {
	return serviceRows('/rest/v1/quote_items?quote_id=eq.' + id + '&select=*&order=position.asc', user);
}

async function moveLeadToDecision(leadId, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await leadById(leadId, user);
		await mustRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			anonKey,
			await signIn(user)
		);
	}
}

async function createProduct(user, code) {
	const created = await mustRpc(
		'create_product',
		{
			p_product_code: code,
			p_name: code + ' Product',
			p_customer_description: 'Original customer copy',
			p_internal_notes: 'P24 private source note',
			p_kind: 'service',
			p_unit_label: 'hour',
			p_currency: 'ZAR',
			p_unit_price: '125.5000',
			p_taxable: true
		},
		anonKey,
		await signIn(user)
	);
	let product = await productById(created.product_id, user);
	await mustRpc(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version },
		anonKey,
		await signIn(user)
	);
	product = await productById(product.id, user);
	return product;
}

async function main() {
	expectMigrationOnly();

	const owner = await createUser('owner', 'p24-builder-owner');
	const sales = await createUser('sales', 'p24-builder-sales');
	users.push(owner, sales);

	const lead = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p24-builder',
			p_external_submission_id: prefix + '-p24-lead',
			p_payload: {
				first_name: 'P24',
				last_name: 'Builder',
				email: prefix + '@example.test',
				company: 'P24 Builder Company',
				message: 'Quote builder source review'
			}
		},
		serviceRoleKey
	);
	await moveLeadToDecision(lead.lead_id, owner);

	const draft = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.lead_id,
			p_client_id: null,
			p_subject: 'P24 quote builder',
			p_introduction: 'Builder test',
			p_terms: 'Builder terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [
				{
					name: 'Custom line',
					description: 'Custom line remains first-class',
					quantity: '1',
					unit_price: '10.0000',
					taxable: true
				}
			]
		},
		anonKey,
		await signIn(owner)
	);
	let quote = await quoteById(draft.quote_id, owner);
	let items = await itemsByQuote(quote.id, owner);
	const customItem = items[0];
	const product = await createProduct(owner, prefix + '-P24-001');

	const selected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: '2'
		},
		anonKey,
		await signIn(sales)
	);

	quote = await quoteById(quote.id, owner);
	items = await itemsByQuote(quote.id, owner);
	let catalogueItem = items.find((item) => item.id === selected.quote_item_id);
	assert(catalogueItem?.source_type === 'catalogue', 'P24 fixture did not create a catalogue line');
	assert(customItem.source_type === 'custom', 'P24 fixture custom line did not start as custom');

	const saved = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: quote.id,
			p_lock_version: quote.lock_version,
			p_lead_id: lead.lead_id,
			p_client_id: null,
			p_subject: quote.subject,
			p_introduction: quote.introduction,
			p_terms: quote.terms,
			p_tax_label: quote.tax_label,
			p_tax_rate: String(quote.tax_rate),
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: [
				{
					id: customItem.id,
					name: customItem.name,
					description: customItem.description,
					quantity: '1',
					unit_price: '10.0000',
					taxable: true
				},
				{
					id: catalogueItem.id,
					name: catalogueItem.name,
					description: 'Negotiated customer description',
					quantity: '2.5000',
					unit_price: '111.1100',
					taxable: true
				}
			]
		},
		anonKey,
		await signIn(sales)
	);
	quote = await quoteById(quote.id, owner);
	items = await itemsByQuote(quote.id, owner);
	catalogueItem = items.find((item) => item.id === catalogueItem.id);
	assert(
		saved.status === 'draft' &&
			items.some((item) => item.id === customItem.id && item.source_type === 'custom') &&
			catalogueItem?.source_type === 'catalogue' &&
			catalogueItem.product_id === product.id &&
			catalogueItem.description === 'Negotiated customer description' &&
			Number(catalogueItem.quantity) === 2.5 &&
			Number(catalogueItem.unit_price) === 111.11 &&
			Number(catalogueItem.catalogue_unit_price) === 125.5 &&
			catalogueItem.source_product_version === product.lock_version,
		'save_quote_draft did not preserve catalogue lineage while editing commercial fields'
	);

	await expectRpcFailure(
		'refresh_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: catalogueItem.id,
			p_product_lock_version: product.lock_version - 1
		},
		sales,
		'stale Product refresh'
	);

	const changed = await mustRpc(
		'update_product',
		{
			p_product_id: product.id,
			p_lock_version: product.lock_version,
			p_product_code: prefix + '-P24-UPDATED',
			p_name: 'Updated P24 Product',
			p_customer_description: 'Updated customer copy',
			p_internal_notes: 'Updated private source note',
			p_kind: product.kind,
			p_category_id: null,
			p_unit_label: 'session',
			p_currency: product.currency,
			p_taxable: false
		},
		anonKey,
		await signIn(owner)
	);
	const currentProduct = await productById(changed.product_id, owner);

	const refreshed = await mustRpc(
		'refresh_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: catalogueItem.id,
			p_product_lock_version: currentProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	quote = await quoteById(quote.id, owner);
	items = await itemsByQuote(quote.id, owner);
	catalogueItem = items.find((item) => item.id === catalogueItem.id);
	assert(
		refreshed.status === 'draft' &&
			catalogueItem.name === 'Updated P24 Product' &&
			catalogueItem.description === 'Updated customer copy' &&
			catalogueItem.product_code_snapshot === currentProduct.product_code &&
			catalogueItem.unit_label_snapshot === 'session' &&
			catalogueItem.source_product_version === currentProduct.lock_version &&
			Number(catalogueItem.catalogue_unit_price) === 125.5 &&
			Number(catalogueItem.quantity) === 2.5 &&
			Number(catalogueItem.unit_price) === 111.11 &&
			catalogueItem.taxable === false &&
			catalogueItem.source_product_reviewed_version === null,
		'Refresh did not copy the Product snapshot while preserving negotiated values'
	);

	const refreshedActivities = await serviceRows(
		'/rest/v1/activities?quote_id=eq.' +
			quote.id +
			'&event_type=eq.quote_item_product_refreshed&select=*',
		owner
	);
	assert(refreshedActivities.length === 1, 'Refresh did not append Activity evidence');

	const repriced = await mustRpc(
		'change_product_price',
		{
			p_product_id: currentProduct.id,
			p_lock_version: currentProduct.lock_version,
			p_unit_price: '333.3333',
			p_reason: 'P24 stale source proof'
		},
		anonKey,
		await signIn(owner)
	);
	const staleProduct = await productById(repriced.product_id, owner);
	quote = await quoteById(quote.id, owner);

	await expectRpcFailure(
		'mark_quote_ready',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		sales,
		'unresolved stale Product readiness'
	);

	const reviewed = await mustRpc(
		'review_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: catalogueItem.id,
			p_product_lock_version: staleProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	quote = await quoteById(quote.id, owner);
	items = await itemsByQuote(quote.id, owner);
	catalogueItem = items.find((item) => item.id === catalogueItem.id);
	assert(
		reviewed.status === 'draft' &&
			catalogueItem.name === 'Updated P24 Product' &&
			catalogueItem.description === 'Updated customer copy' &&
			Number(catalogueItem.quantity) === 2.5 &&
			Number(catalogueItem.unit_price) === 111.11 &&
			Number(catalogueItem.catalogue_unit_price) === 125.5 &&
			catalogueItem.source_product_version === currentProduct.lock_version &&
			catalogueItem.source_product_reviewed_version === staleProduct.lock_version &&
			catalogueItem.source_product_reviewed_at &&
			catalogueItem.source_product_reviewed_by === sales.id,
		'Keep did not preserve commercial values or record review evidence'
	);

	const reviewedActivities = await serviceRows(
		'/rest/v1/activities?quote_id=eq.' +
			quote.id +
			'&event_type=eq.quote_item_product_reviewed&select=*',
		owner
	);
	assert(reviewedActivities.length === 1, 'Keep did not append Activity evidence');

	const ready = await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		anonKey,
		await signIn(owner)
	);
	assert(ready.status === 'ready', 'Reviewed stale Product line could not become ready');

	const terminalQuote = await quoteById(quote.id, owner);
	await expectRpcFailure(
		'refresh_product_quote_item',
		{
			p_quote_id: terminalQuote.id,
			p_quote_lock_version: terminalQuote.lock_version,
			p_quote_item_id: catalogueItem.id,
			p_product_lock_version: staleProduct.lock_version
		},
		sales,
		'terminal Quote Product refresh'
	);
	await expectRpcFailure(
		'review_product_quote_item',
		{
			p_quote_id: terminalQuote.id,
			p_quote_lock_version: terminalQuote.lock_version,
			p_quote_item_id: catalogueItem.id,
			p_product_lock_version: staleProduct.lock_version
		},
		sales,
		'terminal Quote Product review'
	);

	console.log('P24 Quote builder source review contract passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
