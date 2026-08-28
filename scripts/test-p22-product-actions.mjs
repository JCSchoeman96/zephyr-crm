import {
	assert,
	authenticated,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRows,
	signIn
} from './p14-test-utils.mjs';

const users = [];

async function expectRpcFailure(name, args, user, label) {
	const result = await rpc(name, args, undefined, await signIn(user));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
	return result;
}

async function productById(id, user) {
	const rows = await serviceRows(`/rest/v1/products?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Product ${id} was not returned`);
	return rows[0];
}

async function categoryById(id, user) {
	const rows = await serviceRows(`/rest/v1/product_categories?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `ProductCategory ${id} was not returned`);
	return rows[0];
}

async function productActivities(id, user) {
	return serviceRows(
		`/rest/v1/activities?product_id=eq.${id}&select=*&order=occurred_at.asc`,
		user
	);
}

async function categoryActivities(id, user) {
	return serviceRows(
		`/rest/v1/activities?product_category_id=eq.${id}&select=*&order=occurred_at.asc`,
		user
	);
}

async function main() {
	const owner = await createUser('owner', 'catalogue-owner');
	const admin = await createUser('admin', 'catalogue-admin');
	const sales = await createUser('sales', 'catalogue-sales');
	const viewer = await createUser('viewer', 'catalogue-viewer');
	users.push(owner, admin, sales, viewer);

	const categoryResult = await mustRpc(
		'create_product_category',
		{ p_code: ` ${prefix}-screens `, p_label: 'Screens', p_sort_order: 10 },
		undefined,
		await signIn(owner)
	);
	const category = await categoryById(categoryResult.product_category_id, owner);
	assert(
		category.code === `${prefix}-screens` && category.status === 'active',
		'category normalization failed'
	);
	assert(
		(await categoryActivities(category.id, owner)).some(
			(row) => row.event_type === 'product_category_created'
		),
		'category Activity missing'
	);

	await expectRpcFailure(
		'create_product_category',
		{ p_code: `${prefix}-sales`, p_label: 'Sales category' },
		sales,
		'Sales category mutation'
	);
	await expectRpcFailure(
		'create_product_category',
		{ p_code: `${prefix}-viewer`, p_label: 'Viewer category' },
		viewer,
		'Viewer category mutation'
	);

	const created = await mustRpc(
		'create_product',
		{
			p_product_code: ` ${prefix}-001 `,
			p_name: 'Standard Screen',
			p_customer_description: 'A customer-facing screen',
			p_internal_notes: 'Staff-only sourcing note',
			p_kind: 'product',
			p_category_id: category.id,
			p_unit_label: ' each ',
			p_currency: ' zar ',
			p_unit_price: '125.5000',
			p_taxable: true
		},
		undefined,
		await signIn(admin)
	);
	let product = await productById(created.product_id, admin);
	assert(
		product.product_code === `${prefix}-001` &&
			product.currency === 'ZAR' &&
			product.unit_label === 'each' &&
			Number(product.unit_price) === 125.5 &&
			product.status === 'draft' &&
			product.lock_version === 1,
		'Product create did not normalize the trusted commercial fields'
	);
	assert(
		product.internal_notes === 'Staff-only sourcing note',
		'Product internal notes were not stored for staff'
	);

	await expectRpcFailure(
		'create_product',
		{
			p_product_code: `${prefix}-sales`,
			p_name: 'Sales Product',
			p_kind: 'service',
			p_unit_label: 'job',
			p_currency: 'ZAR',
			p_unit_price: '10.0000',
			p_taxable: false
		},
		sales,
		'Sales Product mutation'
	);
	await expectRpcFailure(
		'create_product',
		{
			p_product_code: `${prefix}-viewer`,
			p_name: 'Viewer Product',
			p_kind: 'service',
			p_unit_label: 'job',
			p_currency: 'ZAR',
			p_unit_price: '10.0000',
			p_taxable: false
		},
		viewer,
		'Viewer Product mutation'
	);

	await expectRpcFailure(
		'create_product',
		{
			p_product_code: `${prefix}-001`,
			p_name: 'Duplicate Code',
			p_kind: 'product',
			p_unit_label: 'each',
			p_currency: 'ZAR',
			p_unit_price: '10.0000',
			p_taxable: true
		},
		admin,
		'case-insensitive duplicate Product code'
	);
	await expectRpcFailure(
		'create_product',
		{
			p_product_code: `${prefix}-negative`,
			p_name: 'Negative Price',
			p_kind: 'product',
			p_unit_label: 'each',
			p_currency: 'ZAR',
			p_unit_price: '-1',
			p_taxable: true
		},
		admin,
		'negative Product price'
	);
	await expectRpcFailure(
		'change_product_price',
		{ p_product_id: product.id, p_lock_version: product.lock_version, p_unit_price: '1.00001' },
		admin,
		'over-scale Product price'
	);

	const staleLock = product.lock_version;
	await expectRpcFailure(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: staleLock },
		sales,
		'Sales Product activation'
	);
	const activated = await mustRpc(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: staleLock },
		undefined,
		await signIn(admin)
	);
	product = await productById(product.id, admin);
	assert(activated.status === 'active' && product.status === 'active', 'Product activation failed');
	assert(
		(await productActivities(product.id, admin)).some(
			(row) => row.event_type === 'product_activated'
		),
		'activation Activity missing'
	);
	await expectRpcFailure(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: staleLock },
		admin,
		'stale Product activation lock'
	);

	const priced = await mustRpc(
		'change_product_price',
		{
			p_product_id: product.id,
			p_lock_version: product.lock_version,
			p_unit_price: '140.2500',
			p_reason: 'Annual catalogue update'
		},
		undefined,
		await signIn(admin)
	);
	product = await productById(product.id, admin);
	assert(
		priced.unit_price === '140.2500' && product.lock_version === 3,
		'Product price change failed'
	);
	const priceEvent = (await productActivities(product.id, admin)).find(
		(row) => row.event_type === 'product_price_changed'
	);
	assert(
		priceEvent?.metadata?.old_unit_price === '125.5000' &&
			priceEvent?.metadata?.new_unit_price === '140.2500' &&
			priceEvent?.metadata?.reason === 'Annual catalogue update',
		'Product price Activity does not contain old/new evidence'
	);
	await expectRpcFailure(
		'change_product_price',
		{ p_product_id: product.id, p_lock_version: product.lock_version, p_unit_price: '150.0000' },
		sales,
		'Sales Product price change'
	);

	const inactivated = await mustRpc(
		'inactivate_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version },
		undefined,
		await signIn(admin)
	);
	product = await productById(product.id, admin);
	assert(
		inactivated.status === 'inactive' && product.status === 'inactive',
		'Product inactivation failed'
	);
	const reactivated = await mustRpc(
		'activate_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version },
		undefined,
		await signIn(admin)
	);
	assert(reactivated.status === 'active', 'Inactive Product did not reactivate');
	product = await productById(product.id, admin);
	await expectRpcFailure(
		'archive_product',
		{ p_product_id: product.id, p_lock_version: product.lock_version, p_reason: 'Archive active' },
		admin,
		'archive active Product'
	);

	const draftToArchive = await mustRpc(
		'create_product',
		{
			p_product_code: `${prefix}-archive`,
			p_name: 'Archive Me',
			p_kind: 'service',
			p_unit_label: 'job',
			p_currency: 'ZAR',
			p_unit_price: '50.0000',
			p_taxable: false
		},
		undefined,
		await signIn(owner)
	);
	let archived = await productById(draftToArchive.product_id, owner);
	await expectRpcFailure(
		'archive_product',
		{ p_product_id: archived.id, p_lock_version: archived.lock_version, p_reason: ' ' },
		owner,
		'archive without a reason'
	);
	await mustRpc(
		'archive_product',
		{
			p_product_id: archived.id,
			p_lock_version: archived.lock_version,
			p_reason: 'Discontinued service'
		},
		undefined,
		await signIn(owner)
	);
	archived = await productById(archived.id, owner);
	assert(archived.status === 'archived' && archived.archived_at, 'Product archive failed');
	await expectRpcFailure(
		'activate_product',
		{ p_product_id: archived.id, p_lock_version: archived.lock_version },
		owner,
		'activate archived Product'
	);
	await mustRpc(
		'restore_product',
		{
			p_product_id: archived.id,
			p_lock_version: archived.lock_version,
			p_reason: 'Restored for review'
		},
		undefined,
		await signIn(owner)
	);
	archived = await productById(archived.id, owner);
	assert(archived.status === 'inactive' && archived.archived_at === null, 'Product restore failed');

	const categoryCurrent = await categoryById(category.id, owner);
	await mustRpc(
		'inactivate_product_category',
		{
			p_category_id: category.id,
			p_lock_version: categoryCurrent.lock_version,
			p_reason: 'Seasonal pause'
		},
		undefined,
		await signIn(owner)
	);
	const inactiveCategory = await categoryById(category.id, owner);
	assert(inactiveCategory.status === 'inactive', 'category inactivation failed');
	await expectRpcFailure(
		'create_product',
		{
			p_product_code: `${prefix}-inactive-category`,
			p_name: 'Blocked Category Product',
			p_kind: 'product',
			p_category_id: category.id,
			p_unit_label: 'each',
			p_currency: 'ZAR',
			p_unit_price: '10.0000',
			p_taxable: true
		},
		owner,
		'Product with inactive category'
	);
	await mustRpc(
		'activate_product_category',
		{ p_category_id: category.id, p_lock_version: inactiveCategory.lock_version },
		undefined,
		await signIn(owner)
	);

	const rawPatch = await authenticated(
		`/rest/v1/products?id=eq.${product.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: { name: 'Raw overwrite' }
		},
		admin
	);
	assert(!rawPatch.response.ok, 'raw authenticated Product update bypassed trusted action');
	const rawDelete = await authenticated(
		`/rest/v1/products?id=eq.${product.id}`,
		{ method: 'DELETE' },
		admin
	);
	assert(!rawDelete.response.ok, 'raw authenticated Product delete bypassed archive boundary');

	console.log('P22 Product trusted action contract passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
