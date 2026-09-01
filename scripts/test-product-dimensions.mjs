import {
	assert,
	authenticated,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRows,
	signIn,
	sql,
	sqlLiteral
} from './p14-test-utils.mjs';

const users = [];
const createSignature =
	'public.create_product(text,text,text,text,text,uuid,text,text,numeric,boolean,boolean,jsonb)';
const updateSignature =
	'public.update_product(uuid,bigint,text,text,text,text,text,uuid,text,text,boolean,boolean,jsonb)';
const oldCreateSignature =
	'public.create_product(text,text,text,text,text,uuid,text,text,numeric,boolean)';
const oldUpdateSignature =
	'public.update_product(uuid,bigint,text,text,text,text,text,uuid,text,text,boolean)';

const width = { key: 'width', label: 'Width', unit: 'mm', required: true };

function sqlScalar(query) {
	return sql(query).split(/\r?\n/).find(Boolean) ?? '';
}

function expectSql(query, expected, label) {
	const actual = sqlScalar(query);
	assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

function functionPrivilege(role, signature) {
	return `select coalesce((select has_function_privilege(${sqlLiteral(role)}, p.oid, 'execute') from pg_proc p where p.oid = to_regprocedure(${sqlLiteral(signature)})::oid), false)`;
}

async function expectRpcFailure(name, args, user, label) {
	const result = await rpc(name, args, undefined, await signIn(user));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
}

async function productById(id, user) {
	const rows = await serviceRows(`/rest/v1/products?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Product ${id} was not returned`);
	return rows[0];
}

function baseProduct(code, kind = 'product') {
	return {
		p_product_code: `${prefix}-${code}`,
		p_name: `${code} Product`,
		p_kind: kind,
		p_unit_label: kind === 'service' ? 'job' : 'each',
		p_currency: 'ZAR',
		p_unit_price: '125.5000',
		p_taxable: true
	};
}

function definitionShape(value) {
	return Array.isArray(value)
		? value.map((definition) => ({
					key: definition.key,
					label: definition.label,
					unit: definition.unit,
					required: definition.required
				}))
		: value;
}

async function schemaContract() {
	expectSql(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name in ('dimensions_enabled', 'dimension_definitions')`,
		'2',
		'Product dimension columns'
	);
	expectSql(
		`select count(*) from pg_constraint where conname in ('products_dimensions_configuration_check', 'products_service_dimensions_check')`,
		'2',
		'Product dimension constraints'
	);
	expectSql(
		`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product'`,
		'1',
		'create_product overload count'
	);
	expectSql(
		`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_product'`,
		'1',
		'update_product overload count'
	);
	expectSql(
		`select to_regprocedure(${sqlLiteral(oldCreateSignature)}) is null`,
		't',
		'old create_product overload removed'
	);
	expectSql(
		`select to_regprocedure(${sqlLiteral(oldUpdateSignature)}) is null`,
		't',
		'old update_product overload removed'
	);
	expectSql(
		functionPrivilege('authenticated', createSignature),
		't',
		'authenticated create_product grant'
	);
	expectSql(
		functionPrivilege('authenticated', updateSignature),
		't',
		'authenticated update_product grant'
	);
	expectSql(
		functionPrivilege('authenticated', oldCreateSignature),
		'f',
		'old create_product grant absent'
	);
	expectSql(
		functionPrivilege('authenticated', oldUpdateSignature),
		'f',
		'old update_product grant absent'
	);
	expectSql(
		functionPrivilege('anon', createSignature),
		'f',
		'anon create_product grant absent'
	);
	expectSql(
		functionPrivilege('anon', updateSignature),
		'f',
		'anon update_product grant absent'
	);
}

async function main() {
	await schemaContract();

	const admin = await createUser('admin', 'dimension-admin');
	const sales = await createUser('sales', 'dimension-sales');
	users.push(admin, sales);

	const dimensional = await mustRpc(
		'create_product',
		{
			...baseProduct('dimensional'),
			p_customer_description: 'Measured product',
			p_dimensions_enabled: true,
			p_dimension_definitions: [
				{ key: 'height', label: ' Height ', unit: ' mm ', required: true },
				{ key: 'width', label: ' Width ', unit: 'mm', required: false }
			]
		},
		undefined,
		await signIn(admin)
	);
	let dimensionalProduct = await productById(dimensional.product_id, admin);
	assert(
		dimensionalProduct.dimensions_enabled === true &&
			JSON.stringify(definitionShape(dimensionalProduct.dimension_definitions)) ===
				JSON.stringify([
					{ key: 'height', label: 'Height', unit: 'mm', required: true },
					{ key: 'width', label: 'Width', unit: 'mm', required: false }
				]),
		'dimensional Product create did not persist normalized ordered definitions'
	);

	const disabled = await mustRpc(
		'create_product',
		baseProduct('disabled'),
		undefined,
		await signIn(admin)
	);
	const disabledProduct = await productById(disabled.product_id, admin);
	assert(
		disabledProduct.dimensions_enabled === false &&
			JSON.stringify(disabledProduct.dimension_definitions) === '[]',
		'disabled Product did not persist an empty definition list'
	);

	await expectRpcFailure(
		'create_product',
		{
			...baseProduct('service-dimensions', 'service'),
			p_dimensions_enabled: true,
			p_dimension_definitions: [width]
		},
		admin,
		'service dimensions'
	);
	await expectRpcFailure(
		'create_product',
		{
			...baseProduct('disabled-definitions'),
			p_dimensions_enabled: false,
			p_dimension_definitions: [width]
		},
		admin,
		'disabled Product definitions'
	);

	const invalidDefinitions = [
		['malformed definitions', 'not-an-array'],
		['unknown fields', [{ ...width, extra: true }]],
		[
			'duplicate keys',
			[
				width,
				{ key: 'width', label: 'Second width', unit: 'mm', required: false }
			]
		],
		['invalid unit', [{ ...width, unit: 'cm' }]],
		['non-boolean required', [{ ...width, required: 'yes' }]],
		['empty label', [{ ...width, label: ' ' }]],
		[
			'more than four definitions',
			[
				width,
				{ key: 'height', label: 'Height', unit: 'mm', required: true },
				{ key: 'length', label: 'Length', unit: 'mm', required: false },
				{ key: 'depth', label: 'Depth', unit: 'mm', required: false },
				{ key: 'width', label: 'Second width', unit: 'mm', required: false }
			]
		]
	];
	for (const [label, definitions] of invalidDefinitions) {
		await expectRpcFailure(
			'create_product',
			{
				...baseProduct(`invalid-${String(label).replaceAll(' ', '-')}`),
				p_dimensions_enabled: true,
				p_dimension_definitions: definitions
			},
			admin,
			String(label)
		);
	}

	const updated = await mustRpc(
		'update_product',
		{
			p_product_id: dimensionalProduct.id,
			p_lock_version: dimensionalProduct.lock_version,
			p_product_code: dimensionalProduct.product_code,
			p_name: 'Updated dimensional Product',
			p_customer_description: dimensionalProduct.customer_description,
			p_internal_notes: dimensionalProduct.internal_notes,
			p_kind: dimensionalProduct.kind,
			p_category_id: dimensionalProduct.category_id,
			p_unit_label: dimensionalProduct.unit_label,
			p_currency: dimensionalProduct.currency,
			p_taxable: dimensionalProduct.taxable,
			p_dimensions_enabled: true,
			p_dimension_definitions: [
				{ key: 'length', label: 'Length', unit: 'mm', required: true }
			]
		},
		undefined,
		await signIn(admin)
	);
	dimensionalProduct = await productById(dimensionalProduct.id, admin);
	assert(
		updated.lock_version === dimensionalProduct.lock_version &&
			dimensionalProduct.lock_version === 2 &&
			dimensionalProduct.dimensions_enabled === true &&
			JSON.stringify(definitionShape(dimensionalProduct.dimension_definitions)) ===
				JSON.stringify([{ key: 'length', label: 'Length', unit: 'mm', required: true }]) &&
			Number(dimensionalProduct.unit_price) === 125.5 &&
			dimensionalProduct.currency === 'ZAR' &&
			dimensionalProduct.taxable === true,
		'Product dimension update did not preserve lock/version or commercial fields'
	);

	await expectRpcFailure(
		'create_product',
		{ ...baseProduct('anonymous'), p_dimensions_enabled: false, p_dimension_definitions: [] },
		sales,
		'Sales Product mutation'
	);
	const anonymous = await rpc('create_product', {
		...baseProduct('anonymous-role'),
		p_dimensions_enabled: false,
		p_dimension_definitions: []
	});
	assert(!anonymous.response.ok, 'anonymous Product mutation unexpectedly succeeded');

	const rawPatch = await authenticated(
		`/rest/v1/products?id=eq.${dimensionalProduct.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({ name: 'Raw dimension overwrite' })
		},
		sales
	);
	assert(!rawPatch.response.ok, 'raw authenticated Product update bypassed trusted action');

	const rawDelete = await authenticated(
		`/rest/v1/products?id=eq.${dimensionalProduct.id}`,
		{ method: 'DELETE' },
		sales
	);
	assert(!rawDelete.response.ok, 'raw authenticated Product delete bypassed trusted action');

	console.log('Product dimensions trusted boundary contract passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
