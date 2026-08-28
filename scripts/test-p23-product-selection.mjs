import {
	anonKey,
	assert,
	authenticated,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRoleKey,
	serviceRows,
	signIn
} from './p14-test-utils.mjs';

const users = [];

async function expectRpcFailure(name, args, user, label) {
	const result = await rpc(name, args, anonKey, await signIn(user));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
	return result;
}

async function leadById(id, user) {
	const rows = await serviceRows(`/rest/v1/leads?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Lead ${id} was not returned`);
	return rows[0];
}

async function quoteById(id, user) {
	const rows = await serviceRows(`/rest/v1/quotes?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Quote ${id} was not returned`);
	return rows[0];
}

async function productById(id, user) {
	const rows = await serviceRows(`/rest/v1/products?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Product ${id} was not returned`);
	return rows[0];
}

async function itemsByQuote(id, user) {
	return serviceRows(`/rest/v1/quote_items?quote_id=eq.${id}&select=*&order=position.asc`, user);
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

async function createProduct(user, code, currency = 'ZAR') {
	const created = await mustRpc(
		'create_product',
		{
			p_product_code: code,
			p_name: `${code} Product`,
			p_customer_description: 'Customer catalogue copy',
			p_internal_notes: 'Never copy this private source note',
			p_kind: 'product',
			p_unit_label: 'each',
			p_currency: currency,
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
	const owner = await createUser('owner', 'p23-selection-owner');
	const sales = await createUser('sales', 'p23-selection-sales');
	const viewer = await createUser('viewer', 'p23-selection-viewer');
	users.push(owner, sales, viewer);

	const lead = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p23-selection',
			p_external_submission_id: `${prefix}-selection-lead`,
			p_payload: {
				first_name: 'P23',
				last_name: 'Snapshot',
				email: `${prefix}@example.test`,
				company: 'P23 Snapshot Company',
				message: 'Snapshot tracer enquiry'
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
			p_subject: 'P23 snapshot quote',
			p_introduction: 'Snapshot test introduction',
			p_terms: 'Snapshot test terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [
				{
					name: 'Existing custom line',
					description: 'Custom compatibility fixture',
					quantity: '1.0000',
					unit_price: '10.0100',
					taxable: true
				}
			]
		},
		anonKey,
		await signIn(owner)
	);
	let quote = await quoteById(draft.quote_id, owner);
	let items = await itemsByQuote(quote.id, owner);
	assert(
		items.length === 1 &&
			items[0].source_type === 'custom' &&
			items[0].product_id === null &&
			items[0].catalogue_unit_price === null,
		'Existing custom lines did not receive the compatibility source default'
	);

	const product = await createProduct(owner, `${prefix}-CAT-001`);
	const quantity = '2.1250';
	const selected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: quantity
		},
		anonKey,
		await signIn(sales)
	);
	quote = await quoteById(quote.id, owner);
	items = await itemsByQuote(quote.id, owner);
	const catalogueItem = items.find((item) => item.product_id === product.id);
	assert(catalogueItem, 'Product selection did not create a catalogue QuoteItem');
	assert(
		selected.quote_item_id === catalogueItem.id &&
			catalogueItem.source_type === 'catalogue' &&
			catalogueItem.product_code_snapshot === product.product_code &&
			catalogueItem.unit_label_snapshot === product.unit_label &&
			catalogueItem.source_product_version === product.lock_version &&
			Number(catalogueItem.catalogue_unit_price) === 125.5 &&
			Number(catalogueItem.unit_price) === 125.5 &&
			Number(catalogueItem.quantity) === 2.125 &&
			Number(catalogueItem.line_subtotal) === 266.69 &&
			!('internal_notes' in catalogueItem),
		'Product selection did not copy the exact customer snapshot without private notes'
	);
	assert(
		Number(quote.subtotal) === 276.7 &&
			Number(quote.tax_amount) === 41.51 &&
			Number(quote.total) === 318.21,
		'Product selection did not recalculate authoritative Quote totals'
	);

	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version - 1,
			p_quantity: '1'
		},
		sales,
		'stale Product lock'
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version - 1,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: '1'
		},
		sales,
		'stale Quote lock'
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: '0.0000'
		},
		sales,
		'zero Product quantity'
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: '1.00001'
		},
		sales,
		'over-scale Product quantity'
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version,
			p_quantity: '1'
		},
		viewer,
		'Viewer Product selection'
	);

	const inactive = await mustRpc(
		'create_product',
		{
			p_product_code: `${prefix}-INACTIVE`,
			p_name: 'Inactive Product',
			p_kind: 'service',
			p_unit_label: 'job',
			p_currency: 'ZAR',
			p_unit_price: '1.0000',
			p_taxable: false
		},
		anonKey,
		await signIn(owner)
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: inactive.product_id,
			p_product_lock_version: 1,
			p_quantity: '1'
		},
		sales,
		'inactive Product selection'
	);

	const usdProduct = await createProduct(owner, `${prefix}-USD-001`, 'USD');
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: usdProduct.id,
			p_product_lock_version: usdProduct.lock_version,
			p_quantity: '1'
		},
		sales,
		'currency mismatch'
	);

	const itemSnapshot = {
		name: catalogueItem.name,
		code: catalogueItem.product_code_snapshot,
		unitPrice: Number(catalogueItem.unit_price),
		cataloguePrice: Number(catalogueItem.catalogue_unit_price),
		version: catalogueItem.source_product_version
	};
	const repriced = await mustRpc(
		'change_product_price',
		{
			p_product_id: product.id,
			p_lock_version: product.lock_version,
			p_unit_price: '999.9999',
			p_reason: 'Snapshot mutation proof'
		},
		anonKey,
		await signIn(owner)
	);
	assert(
		repriced.lock_version === product.lock_version + 1,
		'Product price mutation did not advance its lock'
	);
	items = await itemsByQuote(quote.id, owner);
	const unchanged = items.find((item) => item.id === catalogueItem.id);
	assert(
		unchanged &&
			unchanged.name === itemSnapshot.name &&
			unchanged.product_code_snapshot === itemSnapshot.code &&
			Number(unchanged.unit_price) === itemSnapshot.unitPrice &&
			Number(unchanged.catalogue_unit_price) === itemSnapshot.cataloguePrice &&
			unchanged.source_product_version === itemSnapshot.version,
		'Product price mutation changed the QuoteItem snapshot'
	);

	const ready = await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		anonKey,
		await signIn(owner)
	);
	assert(ready.status === 'ready', 'Quote did not finalize after Product selection');
	const frozenQuote = await quoteById(quote.id, owner);
	const frozenFacts = {
		status: frozenQuote.status,
		subject: frozenQuote.subject,
		currency: frozenQuote.currency,
		subtotal: Number(frozenQuote.subtotal),
		taxAmount: Number(frozenQuote.tax_amount),
		total: Number(frozenQuote.total),
		snapshot: JSON.stringify(frozenQuote.quote_snapshot)
	};
	const postFinalMutation = await mustRpc(
		'change_product_price',
		{
			p_product_id: product.id,
			p_lock_version: repriced.lock_version,
			p_unit_price: '777.7777',
			p_reason: 'Post-finalization snapshot mutation proof'
		},
		anonKey,
		await signIn(owner)
	);
	const finalQuote = await quoteById(quote.id, owner);
	const finalItems = await itemsByQuote(quote.id, owner);
	const finalItem = finalItems.find((item) => item.id === catalogueItem.id);
	assert(
		postFinalMutation.lock_version === repriced.lock_version + 1 &&
			finalQuote.status === frozenFacts.status &&
			finalQuote.subject === frozenFacts.subject &&
			finalQuote.currency === frozenFacts.currency &&
			Number(finalQuote.subtotal) === frozenFacts.subtotal &&
			Number(finalQuote.tax_amount) === frozenFacts.taxAmount &&
			Number(finalQuote.total) === frozenFacts.total &&
			JSON.stringify(finalQuote.quote_snapshot) === frozenFacts.snapshot &&
			finalItem &&
			finalItem.name === itemSnapshot.name &&
			Number(finalItem.unit_price) === itemSnapshot.unitPrice &&
			Number(finalItem.catalogue_unit_price) === itemSnapshot.cataloguePrice,
		'Product mutation after finalization changed frozen Quote facts'
	);
	await expectRpcFailure(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: ready.lock_version,
			p_product_id: product.id,
			p_product_lock_version: product.lock_version + 1,
			p_quantity: '1'
		},
		sales,
		'Product selection on ready Quote'
	);
	const rawUpdate = await authenticated(
		`/rest/v1/quote_items?id=eq.${catalogueItem.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
			body: JSON.stringify({ name: 'Tampered snapshot' })
		},
		owner
	);
	assert(!rawUpdate.response.ok, 'Raw authenticated QuoteItem mutation unexpectedly succeeded');

	console.log('P23 Product-to-Quote snapshot contract passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
