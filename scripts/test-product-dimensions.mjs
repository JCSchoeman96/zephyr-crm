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
const dimensionsConstraintDefinition =
	"CHECK ((((NOT dimensions_enabled) AND (dimension_definitions = '[]'::jsonb)) OR (dimensions_enabled AND (jsonb_typeof(dimension_definitions) = 'array'::text))))";
const serviceDimensionsConstraintDefinition =
	"CHECK (((kind <> 'service'::text) OR ((NOT dimensions_enabled) AND (dimension_definitions = '[]'::jsonb))))";

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

function updateProductArgs(product, overrides = {}) {
	return {
		p_product_id: product.id,
		p_lock_version: product.lock_version,
		p_product_code: product.product_code,
		p_name: product.name,
		p_customer_description: product.customer_description,
		p_internal_notes: product.internal_notes,
		p_kind: product.kind,
		p_category_id: product.category_id,
		p_unit_label: product.unit_label,
		p_currency: product.currency,
		p_taxable: product.taxable,
		...overrides
	};
}

async function schemaContract() {
	expectSql(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'dimensions_enabled' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'`,
		'1',
		'Product dimensions_enabled column contract'
	);
	expectSql(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'dimension_definitions' and data_type = 'jsonb' and is_nullable = 'NO' and column_default = '''[]''::jsonb'`,
		'1',
		'Product dimension_definitions column contract'
	);
	expectSql(
		`select count(*) from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_dimensions_configuration_check' and contype = 'c' and pg_get_constraintdef(oid) = ${sqlLiteral(dimensionsConstraintDefinition)}`,
		'1',
		'Product dimensions configuration constraint'
	);
	expectSql(
		`select count(*) from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_service_dimensions_check' and contype = 'c' and pg_get_constraintdef(oid) = ${sqlLiteral(serviceDimensionsConstraintDefinition)}`,
		'1',
		'Product service dimensions constraint'
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
	for (const [label, signature] of [
		['create_product', createSignature],
		['update_product', updateSignature]
	]) {
		expectSql(
			functionPrivilege('authenticated', signature),
			't',
			`authenticated ${label} execute grant`
		);
		expectSql(functionPrivilege('public', signature), 'f', `public ${label} execute grant absent`);
		expectSql(
			functionPrivilege('service_role', signature),
			'f',
			`service_role ${label} execute grant absent`
		);
	}
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
	expectSql(functionPrivilege('anon', createSignature), 'f', 'anon create_product grant absent');
	expectSql(functionPrivilege('anon', updateSignature), 'f', 'anon update_product grant absent');
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
			[width, { key: 'width', label: 'Second width', unit: 'mm', required: false }]
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
			...updateProductArgs(dimensionalProduct),
			p_name: 'Updated dimensional Product',
			p_dimensions_enabled: true,
			p_dimension_definitions: [{ key: 'length', label: 'Length', unit: 'mm', required: true }]
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

	const disabledUpdate = await mustRpc(
		'update_product',
		{
			...updateProductArgs(dimensionalProduct),
			p_dimensions_enabled: false,
			p_dimension_definitions: []
		},
		undefined,
		await signIn(admin)
	);
	dimensionalProduct = await productById(dimensionalProduct.id, admin);
	assert(
		disabledUpdate.lock_version === dimensionalProduct.lock_version &&
			dimensionalProduct.lock_version === 3 &&
			dimensionalProduct.dimensions_enabled === false &&
			JSON.stringify(dimensionalProduct.dimension_definitions) === '[]',
		'Product dimension disable update did not clear definitions or increment lock_version'
	);

	await expectRpcFailure(
		'update_product',
		{
			...updateProductArgs(dimensionalProduct),
			p_kind: 'service',
			p_unit_label: 'job',
			p_dimensions_enabled: true,
			p_dimension_definitions: [width]
		},
		admin,
		'service dimensions on update'
	);
	dimensionalProduct = await productById(dimensionalProduct.id, admin);
	assert(
		dimensionalProduct.kind === 'product' &&
			dimensionalProduct.lock_version === 3 &&
			dimensionalProduct.dimensions_enabled === false &&
			JSON.stringify(dimensionalProduct.dimension_definitions) === '[]',
		'Rejected service dimension update changed the Product'
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
