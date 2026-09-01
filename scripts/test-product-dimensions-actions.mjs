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

const users = [];

async function expectRpcFailure(name, args, user, label) {
	const result = await rpc(name, args, anonKey, await signIn(user));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
	return result;
}

async function rows(path, user) {
	return serviceRows(path, user);
}

async function one(path, user, label) {
	const result = await rows(path, user);
	assert(result.length === 1, `${label} was not returned exactly once`);
	return result[0];
}

async function moveLeadToDecision(leadId, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const lead = await one(`/rest/v1/leads?id=eq.${leadId}&select=*`, user, 'Lead');
		await mustRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: lead.lock_version },
			anonKey,
			await signIn(user)
		);
	}
}

async function createProduct(user, code, dimensions = false, kind = 'product', categoryId = null) {
	const created = await mustRpc(
		'create_product',
		{
			p_product_code: code,
			p_name: `${code} Product`,
			p_customer_description: `${code} customer description`,
			p_internal_notes: `${code} private notes`,
			p_kind: kind,
			p_category_id: categoryId,
			p_unit_label: 'each',
			p_currency: 'ZAR',
			p_unit_price: '1500.0000',
			p_taxable: true,
			p_dimensions_enabled: dimensions,
			p_dimension_definitions: dimensions
				? [
						{ key: 'width', label: 'Width', unit: 'mm', required: true },
						{ key: 'height', label: 'Height', unit: 'mm', required: true }
					]
				: []
		},
		anonKey,
		await signIn(user)
	);
	let product = await one(`/rest/v1/products?id=eq.${created.product_id}&select=*`, user, 'Product');
	await mustRpc(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version },
		anonKey,
		await signIn(user)
	);
	return one(`/rest/v1/products?id=eq.${product.id}&select=*`, user, 'Active Product');
}

async function main() {
	const owner = await createUser('owner', 'dimensions-actions-owner');
	const sales = await createUser('sales', 'dimensions-actions-sales');
	users.push(owner, sales);

	const categoryCode = `${prefix}-BLINDS`;
	const category = await mustRpc(
		'create_product_category',
		{ p_code: categoryCode, p_label: 'Blinds', p_sort_order: 10 },
		anonKey,
		await signIn(owner)
	);
	const dimensional = await createProduct(owner, `${prefix}-DIM`, true, 'product', category.product_category_id);
	const ordinary = await createProduct(owner, `${prefix}-ORD`);
	const service = await createProduct(owner, `${prefix}-SVC`, false, 'service');

	const lead = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'dimensions-actions',
			p_external_submission_id: `${prefix}-lead`,
			p_payload: {
				first_name: 'Dimensions',
				last_name: 'Actions',
				email: `${prefix}@example.test`,
				message: 'Width: 1500mm Height: 1500mm Openings: 2'
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
			p_subject: 'Dimensions action quote',
			p_introduction: null,
			p_terms: 'Terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: []
		},
		anonKey,
		await signIn(owner)
	);
	let quote = await one(`/rest/v1/quotes?id=eq.${draft.quote_id}&select=*`, owner, 'Draft quote');

	const selected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: dimensional.id,
			p_product_lock_version: dimensional.lock_version,
			p_quantity: '7'
		},
		anonKey,
		await signIn(sales)
	);
	let items = await rows(`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`, owner);
	assert(items.length === 1, 'Dimensional selection should create exactly one line');
	let dimensionalItem = items[0];
	assert(
		selected.quote_item_id === dimensionalItem.id &&
			Number(dimensionalItem.quantity) === 1 &&
			dimensionalItem.dimensions?.length === 2 &&
			dimensionalItem.dimensions.every((dimension) => dimension.value === null) &&
			dimensionalItem.product_category_id_snapshot === category.product_category_id &&
			dimensionalItem.product_category_code_snapshot === categoryCode &&
			dimensionalItem.product_category_label_snapshot === 'Blinds' &&
			Number(dimensionalItem.unit_price) === 1500 &&
			Number(dimensionalItem.line_subtotal) === 1500,
		'add_product_quote_item did not create the trusted dimensional snapshot'
	);

	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Selected quote');
	const widthHeight = (width, height) => [
		{ key: 'width', label: 'Width', unit: 'mm', required: true, value: width },
		{ key: 'height', label: 'Height', unit: 'mm', required: true, value: height }
	];
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
					id: dimensionalItem.id,
					name: 'Tampered product name',
					description: 'First opening',
					quantity: '1',
					unit_price: '1550.00',
					taxable: true,
					dimensions: widthHeight('1500', '1500'),
					product_code_snapshot: 'BROWSER-TAMPER',
					product_category_label_snapshot: 'Browser category'
				},
				{
					product_id: dimensional.id,
					product_lock_version: dimensional.lock_version,
					name: 'Another tampered name',
					description: 'Second opening',
					quantity: '1',
					unit_price: '1000.00',
					taxable: true,
					dimensions: widthHeight('1000', '900'),
					product_code_snapshot: 'BROWSER-TAMPER-2'
				}
			]
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Saved quote');
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Quote after ordinary lines');
	items = await rows(`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`, owner);
	assert(
		saved.status === 'draft' &&
			items.length === 2 &&
			items.every((item) => item.product_id === dimensional.id) &&
			items[0].name === dimensional.name &&
			items[0].product_code_snapshot === dimensional.product_code &&
			items[0].dimensions[0].value === '1500' &&
			items[1].dimensions[0].value === '1000' &&
			Number(items[0].quantity) === 1 &&
			Number(items[1].quantity) === 1 &&
			Number(items[0].unit_price) === 1550 &&
			Number(items[1].unit_price) === 1000 &&
			Number(quote.subtotal) === 2550 &&
			Number(quote.tax_amount) === 382.5,
		'save_quote_draft did not preserve separate dimensional lines and trusted snapshots'
	);

	await expectRpcFailure(
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
			p_tax_rate: '15',
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: [{ name: 'Custom', quantity: '1', unit_price: '10', dimensions: widthHeight('1', '1') }]
		},
		sales,
		'custom dimensional line'
	);
	await expectRpcFailure(
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
			p_tax_rate: '15',
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: [{ ...items[0], id: items[0].id, quantity: '2' }]
		},
		sales,
		'dimensional quantity other than one'
	);
	await expectRpcFailure(
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
			p_tax_rate: '15',
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: [{ ...items[0], id: items[0].id, dimensions: widthHeight('0', '1500') }]
		},
		sales,
		'zero dimensional value'
	);

	await mustRpc(
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
			p_tax_rate: '15',
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: items.map((item, index) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				quantity: '1',
				unit_price: String(item.unit_price),
				taxable: item.taxable,
				dimensions: widthHeight(index === 0 ? '1500' : '1000', index === 0 ? null : '900')
			}))
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Incomplete quote');
	const readinessFailure = await expectRpcFailure('mark_quote_ready', { p_quote_id: quote.id, p_lock_version: quote.lock_version }, sales, 'incomplete dimensions');
	assert(readinessFailure.body?.message || readinessFailure.body?.code, 'Readiness failure did not return a database error');

	const ordinarySelected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: ordinary.id,
			p_product_lock_version: ordinary.lock_version,
			p_quantity: '2'
		},
		anonKey,
		await signIn(sales)
	);
	assert(ordinarySelected.quote_item_id, 'Ordinary Product selection regressed');
	const serviceSelected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: (await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Quote')).lock_version,
			p_product_id: service.id,
			p_product_lock_version: service.lock_version,
			p_quantity: '3'
		},
		anonKey,
		await signIn(sales)
	);
	assert(serviceSelected.quote_item_id, 'Service selection regressed');

	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Quote after ordinary lines');
	items = await rows(`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`, owner);
	const completeItems = items.map((item) => ({
		id: item.id,
		name: item.name,
		description: item.description,
		quantity: item.dimensions.length > 0 ? '1' : String(item.quantity),
		unit_price: String(item.unit_price),
		taxable: item.taxable,
		dimensions: item.product_id === dimensional.id ? widthHeight(item.position === 1 ? '1500' : '1000', item.position === 1 ? '1500' : '900') : []
	}));
	await mustRpc(
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
			p_items: completeItems
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Complete quote');
	items = await rows(`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`, owner);
	dimensionalItem = items.find((item) => item.product_id === dimensional.id);

	const categoryRow = await one(
		`/rest/v1/product_categories?id=eq.${category.product_category_id}&select=*`,
		owner,
		'Product category'
	);
	await mustRpc(
		'update_product_category',
		{
			p_category_id: categoryRow.id,
			p_lock_version: categoryRow.lock_version,
			p_code: categoryCode,
			p_label: 'Blinds refreshed',
			p_sort_order: categoryRow.sort_order
		},
		anonKey,
		await signIn(owner)
	);
	const refreshedProduct = await mustRpc(
		'update_product',
		{
			p_product_id: dimensional.id,
			p_lock_version: dimensional.lock_version,
			p_product_code: dimensional.product_code,
			p_name: dimensional.name,
			p_customer_description: dimensional.customer_description,
			p_internal_notes: dimensional.internal_notes,
			p_kind: dimensional.kind,
			p_category_id: categoryRow.id,
			p_unit_label: dimensional.unit_label,
			p_currency: dimensional.currency,
			p_taxable: dimensional.taxable,
			p_dimensions_enabled: true,
			p_dimension_definitions: [
				{ key: 'width', label: 'Width', unit: 'mm', required: true },
				{ key: 'height', label: 'Height', unit: 'mm', required: true },
				{ key: 'length', label: 'Length', unit: 'mm', required: false }
			]
		},
		anonKey,
		await signIn(owner)
	);
	const refreshed = await mustRpc(
		'refresh_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: dimensionalItem.id,
			p_product_lock_version: refreshedProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Refreshed quote');
	dimensionalItem = await one(
		`/rest/v1/quote_items?id=eq.${dimensionalItem.id}&select=*`,
		owner,
		'Refreshed dimensional item'
	);
	assert(
		refreshed.quote_item_id === dimensionalItem.id &&
			dimensionalItem.dimensions.length === 3 &&
			dimensionalItem.dimensions[0].value === '1500' &&
			dimensionalItem.dimensions[1].value === '1500' &&
			dimensionalItem.dimensions[2].value === null &&
			dimensionalItem.product_category_label_snapshot === 'Blinds refreshed',
		'refresh_product_quote_item did not map values by key or update category metadata'
	);
	let secondDimensionalItem = (
		await rows(`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`, owner)
	).find((item) => item.product_id === dimensional.id && item.id !== dimensionalItem.id);
	assert(secondDimensionalItem, 'Expected the second same-Product line to remain separate');
	await mustRpc(
		'refresh_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: secondDimensionalItem.id,
			p_product_lock_version: refreshedProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Second refreshed quote');
	secondDimensionalItem = await one(
		`/rest/v1/quote_items?id=eq.${secondDimensionalItem.id}&select=*`,
		owner,
		'Second refreshed dimensional item'
	);

	const reviewedProduct = await mustRpc(
		'update_product',
		{
			p_product_id: dimensional.id,
			p_lock_version: refreshedProduct.lock_version,
			p_product_code: dimensional.product_code,
			p_name: dimensional.name,
			p_customer_description: dimensional.customer_description,
			p_internal_notes: dimensional.internal_notes,
			p_kind: dimensional.kind,
			p_category_id: categoryRow.id,
			p_unit_label: dimensional.unit_label,
			p_currency: dimensional.currency,
			p_taxable: dimensional.taxable,
			p_dimensions_enabled: true,
			p_dimension_definitions: [
				{ key: 'width', label: 'Width', unit: 'mm', required: true },
				{ key: 'length', label: 'Length', unit: 'mm', required: false }
			]
		},
		anonKey,
		await signIn(owner)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Quote before definition removal');
	await mustRpc(
		'refresh_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: secondDimensionalItem.id,
			p_product_lock_version: reviewedProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Definition-removal quote');
	secondDimensionalItem = await one(
		`/rest/v1/quote_items?id=eq.${secondDimensionalItem.id}&select=*`,
		owner,
		'Definition-removal dimensional item'
	);
	assert(
		secondDimensionalItem.dimensions.length === 2 &&
			secondDimensionalItem.dimensions[0].key === 'width' &&
			secondDimensionalItem.dimensions[0].value === '1000' &&
			secondDimensionalItem.dimensions[1].key === 'length' &&
			secondDimensionalItem.dimensions[1].value === null,
		'refresh_product_quote_item did not remove deleted keys while preserving stable values'
	);
	const reviewed = await mustRpc(
		'review_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_quote_item_id: dimensionalItem.id,
			p_product_lock_version: reviewedProduct.lock_version
		},
		anonKey,
		await signIn(sales)
	);
	assert(
		reviewed.dimensions?.[0]?.value === '1500' &&
			reviewed.product_category_label_snapshot === 'Blinds refreshed',
		'review_product_quote_item did not retain the complete line snapshot'
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Reviewed quote');
	const ready = await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		anonKey,
		await signIn(sales)
	);
	const outbound = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: quote.id, p_lock_version: ready.lock_version },
		anonKey,
		await signIn(sales)
	);
	await mustRpc(
		'complete_quote_send',
		{ p_outbound_message_id: outbound.outbound_message_id, p_provider_message_id: `${prefix}-provider` },
		anonKey,
		await signIn(sales)
	);
	const sentQuote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Sent quote');
	const revision = await mustRpc(
		'revise_quote',
		{ p_quote_id: sentQuote.id, p_lock_version: sentQuote.lock_version },
		anonKey,
		await signIn(sales)
	);
	const revisedItems = await rows(`/rest/v1/quote_items?quote_id=eq.${revision.quote_id}&select=*&order=position.asc`, owner);
	const revisedDimensional = revisedItems.find((item) => item.product_id === dimensional.id);
	assert(
		revisedDimensional?.dimensions?.[0]?.value === '1500' &&
			revisedDimensional?.product_category_label_snapshot === 'Blinds refreshed',
		'revise_quote did not copy dimensions and category snapshots'
	);
	await expectRpcFailure(
		'save_quote_draft',
		{
			p_quote_id: sentQuote.id,
			p_lock_version: sentQuote.lock_version,
			p_lead_id: lead.lead_id,
			p_client_id: null,
			p_subject: sentQuote.subject,
			p_introduction: sentQuote.introduction,
			p_terms: sentQuote.terms,
			p_tax_label: sentQuote.tax_label,
			p_tax_rate: String(sentQuote.tax_rate),
			p_valid_until: sentQuote.valid_until,
			p_currency: sentQuote.currency,
			p_items: revisedItems.map((item) => ({ ...item, dimensions: item.dimensions ?? [] }))
		},
		sales,
		'terminal quote edit'
	);

	console.log('Product dimensions trusted actions contract unexpectedly passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
