import { readFileSync } from 'node:fs';

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
const migrationText = readFileSync(
	'supabase/migrations/20260901100000_product_dimensions_and_quote_lines.sql',
	'utf8'
);
const saveQuoteDraftText = migrationText.slice(
	migrationText.indexOf('create or replace function public.save_quote_draft('),
	migrationText.indexOf('create or replace function public.refresh_product_quote_item(')
);
const reviseQuoteText = migrationText.slice(
	migrationText.indexOf('create or replace function public.revise_quote('),
	migrationText.indexOf('create or replace function private.quote_ready_validation(')
);

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

async function createProduct(
	user,
	code,
	dimensions = false,
	kind = 'product',
	categoryId = null,
	unitPrice = '1500.0000'
) {
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
			p_unit_price: unitPrice,
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
	let product = await one(
		`/rest/v1/products?id=eq.${created.product_id}&select=*`,
		user,
		'Product'
	);
	await mustRpc(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version },
		anonKey,
		await signIn(user)
	);
	return one(`/rest/v1/products?id=eq.${product.id}&select=*`, user, 'Active Product');
}

async function main() {
	assert(
		migrationText.includes('order by product_id'),
		'save_quote_draft must pre-lock Product IDs deterministically'
	);
	const saveQuoteLock = saveQuoteDraftText.indexOf(
		'select * into v_quote from public.quotes where id = p_quote_id for update;'
	);
	const saveLeadLock = saveQuoteDraftText.indexOf(
		'select * into v_lead from public.leads where id = p_lead_id for update;'
	);
	const reviseQuoteLock = reviseQuoteText.indexOf(
		'select * into v_source from public.quotes where id = p_quote_id for update;'
	);
	const reviseLeadLock = reviseQuoteText.indexOf(
		'select * into v_lead from public.leads where id = v_source.lead_id for update;'
	);
	assert(
		saveQuoteLock >= 0 && saveQuoteLock < saveLeadLock,
		'save_quote_draft must lock an existing Quote before its Lead'
	);
	assert(
		reviseQuoteLock >= 0 && reviseQuoteLock < reviseLeadLock,
		'revise_quote must lock its Quote before its Lead'
	);
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
	const secondCategoryCode = `${prefix}-SHUTTERS`;
	const secondCategory = await mustRpc(
		'create_product_category',
		{ p_code: secondCategoryCode, p_label: 'Shutters', p_sort_order: 20 },
		anonKey,
		await signIn(owner)
	);
	const dimensional = await createProduct(
		owner,
		`${prefix}-DIM`,
		true,
		'product',
		category.product_category_id
	);
	const secondDimensional = await createProduct(
		owner,
		`${prefix}-SHUTTER-DIM`,
		true,
		'product',
		secondCategory.product_category_id,
		'2200.0000'
	);
	const ordinary = await createProduct(owner, `${prefix}-ORD`);
	const service = await createProduct(owner, `${prefix}-SVC`, false, 'service');
	const staleDimensional = await createProduct(
		owner,
		`${prefix}-STALE-DIM`,
		true,
		'product',
		category.product_category_id
	);

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
	const staleDraft = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.lead_id,
			p_client_id: null,
			p_subject: 'Stale dimensions quote',
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
	const staleSelection = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: staleDraft.quote_id,
			p_quote_lock_version: staleDraft.lock_version,
			p_product_id: staleDimensional.id,
			p_product_lock_version: staleDimensional.lock_version,
			p_quantity: '1'
		},
		anonKey,
		await signIn(sales)
	);
	const staleQuote = await one(
		`/rest/v1/quotes?id=eq.${staleDraft.quote_id}&select=*`,
		owner,
		'Stale dimensions quote'
	);
	await mustRpc(
		'update_product',
		{
			p_product_id: staleDimensional.id,
			p_lock_version: staleDimensional.lock_version,
			p_product_code: staleDimensional.product_code,
			p_name: staleDimensional.name,
			p_customer_description: staleDimensional.customer_description,
			p_internal_notes: staleDimensional.internal_notes,
			p_kind: staleDimensional.kind,
			p_category_id: category.product_category_id,
			p_unit_label: staleDimensional.unit_label,
			p_currency: staleDimensional.currency,
			p_taxable: staleDimensional.taxable,
			p_dimensions_enabled: false,
			p_dimension_definitions: []
		},
		anonKey,
		await signIn(owner)
	);
	await expectRpcFailure(
		'save_quote_draft',
		{
			p_quote_id: staleQuote.id,
			p_lock_version: staleQuote.lock_version,
			p_lead_id: lead.lead_id,
			p_client_id: null,
			p_subject: staleQuote.subject,
			p_introduction: staleQuote.introduction,
			p_terms: staleQuote.terms,
			p_tax_label: staleQuote.tax_label,
			p_tax_rate: String(staleQuote.tax_rate),
			p_valid_until: staleQuote.valid_until,
			p_currency: staleQuote.currency,
			p_items: [
				{
					id: staleSelection.quote_item_id,
					name: 'Stale dimensional line',
					description: 'Must remain governed by stored dimensions',
					quantity: '2',
					unit_price: '1500',
					taxable: true,
					dimensions: []
				}
			]
		},
		sales,
		'stale Product dimension definition change'
	);

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
	let items = await rows(
		`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`,
		owner
	);
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
	const secondSelected = await mustRpc(
		'add_product_quote_item',
		{
			p_quote_id: quote.id,
			p_quote_lock_version: quote.lock_version,
			p_product_id: secondDimensional.id,
			p_product_lock_version: secondDimensional.lock_version,
			p_quantity: '4'
		},
		anonKey,
		await signIn(sales)
	);
	items = await rows(
		`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`,
		owner
	);
	const secondSelectedItem = items.find((item) => item.id === secondSelected.quote_item_id);
	assert(
		secondSelectedItem?.product_id === secondDimensional.id &&
			secondSelectedItem.product_category_id_snapshot === secondCategory.product_category_id &&
			secondSelectedItem.product_category_code_snapshot === secondCategoryCode &&
			secondSelectedItem.product_category_label_snapshot === 'Shutters' &&
			Number(secondSelectedItem.quantity) === 1 &&
			Number(secondSelectedItem.unit_price) === 2200,
		'second dimensional Product did not retain its independent Product/category snapshot'
	);
	quote = await one(
		`/rest/v1/quotes?id=eq.${quote.id}&select=*`,
		owner,
		'Quote after second Product'
	);
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
					id: secondSelectedItem.id,
					name: 'Tampered shutter name',
					description: 'Different category line',
					quantity: '1',
					unit_price: '2200.00',
					taxable: true,
					dimensions: widthHeight('800', '700'),
					product_id: dimensional.id,
					product_category_id_snapshot: '00000000-0000-0000-0000-000000000001'
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
	items = await rows(
		`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`,
		owner
	);
	assert(
		saved.status === 'draft' &&
			items.length === 3 &&
			items[0].product_id === dimensional.id &&
			items[1].product_id === secondDimensional.id &&
			items[2].product_id === dimensional.id &&
			items[0].name === dimensional.name &&
			items[1].name === secondDimensional.name &&
			items[0].product_code_snapshot === dimensional.product_code &&
			items[1].product_code_snapshot === secondDimensional.product_code &&
			items[0].product_category_id_snapshot === category.product_category_id &&
			items[1].product_category_id_snapshot === secondCategory.product_category_id &&
			items[0].product_category_code_snapshot === categoryCode &&
			items[1].product_category_code_snapshot === secondCategoryCode &&
			items[0].product_category_label_snapshot === 'Blinds' &&
			items[1].product_category_label_snapshot === 'Shutters' &&
			items[0].dimensions[0].value === '1500' &&
			items[1].dimensions[0].value === '800' &&
			items[2].dimensions[0].value === '1000' &&
			items.every((item) => Number(item.quantity) === 1) &&
			Number(items[0].unit_price) === 1550 &&
			Number(items[1].unit_price) === 2200 &&
			Number(items[2].unit_price) === 1000 &&
			Number(quote.subtotal) === 4750 &&
			Number(quote.tax_amount) === 712.5,
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
			p_items: [
				{ name: 'Custom', quantity: '1', unit_price: '10', dimensions: widthHeight('1', '1') }
			]
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
				dimensions:
					item.product_id === dimensional.id
						? widthHeight(item.position === 1 ? '1500' : '1000', item.position === 1 ? null : '900')
						: item.product_id === secondDimensional.id
							? widthHeight('800', '700')
							: []
			}))
		},
		anonKey,
		await signIn(sales)
	);
	quote = await one(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, owner, 'Incomplete quote');
	const readinessFailure = await expectRpcFailure(
		'mark_quote_ready',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		sales,
		'incomplete dimensions'
	);
	assert(
		readinessFailure.body?.message || readinessFailure.body?.code,
		'Readiness failure did not return a database error'
	);

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
			p_quote_lock_version: ordinarySelected.quote_lock_version,
			p_product_id: service.id,
			p_product_lock_version: service.lock_version,
			p_quantity: '3'
		},
		anonKey,
		await signIn(sales)
	);
	assert(serviceSelected.quote_item_id, 'Service selection regressed');

	quote = await one(
		`/rest/v1/quotes?id=eq.${quote.id}&select=*`,
		owner,
		'Quote after ordinary lines'
	);
	items = await rows(
		`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`,
		owner
	);
	const ordinaryItem = items.find((item) => item.id === ordinarySelected.quote_item_id);
	const serviceItem = items.find((item) => item.id === serviceSelected.quote_item_id);
	const expectedSubtotal = items.reduce((sum, item) => sum + Number(item.line_subtotal), 0);
	const expectedTaxableSubtotal = items.reduce(
		(sum, item) => sum + (item.taxable ? Number(item.line_subtotal) : 0),
		0
	);
	assert(
		Number(ordinaryItem?.quantity) === 2 &&
			Number(ordinaryItem?.unit_price) === Number(ordinary.unit_price) &&
			Number(ordinaryItem?.line_subtotal) === Number(ordinary.unit_price) * 2 &&
			Number(serviceItem?.quantity) === 3 &&
			Number(serviceItem?.unit_price) === Number(service.unit_price) &&
			Number(serviceItem?.line_subtotal) === Number(service.unit_price) * 3 &&
			Number(quote.subtotal) === expectedSubtotal &&
			Number(quote.tax_amount) === Number((expectedTaxableSubtotal * 0.15).toFixed(2)),
		'ordinary Product or Service selection did not preserve quantity, price, line subtotal, and totals'
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
			p_tax_rate: String(quote.tax_rate),
			p_valid_until: quote.valid_until,
			p_currency: quote.currency,
			p_items: items.map((item) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				quantity: item.id === ordinaryItem.id ? '1.12345' : String(item.quantity),
				unit_price: String(item.unit_price),
				taxable: item.taxable,
				dimensions: item.dimensions ?? []
			}))
		},
		sales,
		'quantity with more than four decimal places'
	);
	const completeItems = items.map((item) => ({
		id: item.id,
		name: item.name,
		description: item.description,
		quantity: item.dimensions.length > 0 ? '1' : String(item.quantity),
		unit_price: String(item.unit_price),
		taxable: item.taxable,
		dimensions:
			item.product_id === dimensional.id
				? widthHeight(item.position === 1 ? '1500' : '1000', item.position === 1 ? '1500' : '900')
				: item.product_id === secondDimensional.id
					? widthHeight('800', '700')
					: []
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
	items = await rows(
		`/rest/v1/quote_items?quote_id=eq.${quote.id}&select=*&order=position.asc`,
		owner
	);
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
	quote = await one(
		`/rest/v1/quotes?id=eq.${quote.id}&select=*`,
		owner,
		'Quote before definition removal'
	);
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
	quote = await one(
		`/rest/v1/quotes?id=eq.${quote.id}&select=*`,
		owner,
		'Definition-removal quote'
	);
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
		{
			p_outbound_message_id: outbound.outbound_message_id,
			p_provider_message_id: `${prefix}-provider`
		},
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
	const revisedItems = await rows(
		`/rest/v1/quote_items?quote_id=eq.${revision.quote_id}&select=*&order=position.asc`,
		owner
	);
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
