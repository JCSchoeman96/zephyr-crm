import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260828100000_v150_product_catalogue.sql';
const baselineCommit = '2874522ee99e09dbb47b63fecc78d14d6076d681';

function run(command, args) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 16 * 1024 * 1024
	}).trim();
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

const databaseUrl = statusEnv().DB_URL;

function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function scalar(query) {
	return sql(query).split(/\r?\n/).find(Boolean) ?? '';
}

function expectCount(query, expected, label) {
	const actual = Number(scalar(query));
	if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

const migration = readFileSync(migrationPath, 'utf8');
if ((migration.match(/^begin;$/gm) ?? []).length !== 1) {
	throw new Error('P22 Product migration must begin one transaction');
}
if ((migration.match(/^commit;$/gm) ?? []).length !== 1) {
	throw new Error('P22 Product migration must commit one transaction');
}

const changedMigrations = run('git', [
	'diff',
	'--name-only',
	baselineCommit,
	'--',
	'supabase/migrations'
])
	.split(/\r?\n/)
	.filter(Boolean);
const historicalChanges = changedMigrations.filter(
	(path) => path !== migrationPath && !path.includes('_v150_')
);
if (historicalChanges.length > 0) {
	throw new Error(`Historical migrations changed: ${historicalChanges.join(', ')}`);
}

expectCount(
	"select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('product_categories', 'products') and c.relkind = 'r'",
	2,
	'Product tables'
);

expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'product_categories' and column_name = any(array['id', 'code', 'label', 'status', 'sort_order', 'lock_version', 'created_at', 'updated_at'])",
	8,
	'ProductCategory fields'
);
expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = any(array['id', 'product_code', 'name', 'customer_description', 'internal_notes', 'kind', 'category_id', 'unit_label', 'currency', 'unit_price', 'taxable', 'status', 'lock_version', 'created_by', 'created_at', 'updated_at', 'activated_at', 'inactivated_at', 'archived_at'])",
	19,
	'Product fields'
);
expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name = any(array['product_id', 'product_category_id'])",
	2,
	'Product Activity lineage fields'
);

expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'unit_price' and data_type = 'numeric' and numeric_precision = 14 and numeric_scale = 4",
	1,
	'Product unit price precision'
);
expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'currency' and character_maximum_length is null",
	1,
	'Product currency type'
);

expectCount(
	"select count(*) from pg_indexes where schemaname = 'public' and indexname in ('product_categories_code_lower_uidx', 'products_product_code_lower_uidx', 'products_status_name_idx', 'products_category_status_name_idx', 'products_kind_status_idx')",
	5,
	'Product indexes'
);

expectCount(
	"select count(*) from pg_constraint where conname in ('product_categories_code_bounds', 'product_categories_label_bounds', 'product_categories_status_check', 'product_categories_sort_order_check', 'product_categories_lock_version_check', 'products_code_bounds', 'products_name_bounds', 'products_kind_check', 'products_unit_bounds', 'products_currency_check', 'products_unit_price_check', 'products_status_check', 'products_lock_version_check', 'products_lifecycle_evidence', 'products_text_bounds')",
	15,
	'Product constraints'
);
expectCount(
	"select count(*) from pg_constraint where conname in ('products_category_id_fkey', 'products_created_by_fkey', 'activities_product_id_fkey', 'activities_product_category_id_fkey')",
	4,
	'Product foreign keys'
);

expectCount(
	"select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('product_categories', 'products') and c.relrowsecurity",
	2,
	'Product RLS'
);
expectCount(
	"select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('product_categories', 'products') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')",
	0,
	'Raw Product writes'
);
expectCount(
	"select count(*) from pg_policies where schemaname = 'public' and tablename in ('product_categories', 'products') and policyname in ('product_categories_select_active', 'products_select_active')",
	2,
	'Product read policies'
);

expectCount(
	"select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('product_categories', 'products') and not t.tgisinternal and t.tgname in ('product_categories_updated_at', 'products_updated_at', 'product_categories_protected_mutation', 'products_protected_mutation')",
	4,
	'Product protected/update triggers'
);

console.log('P22 Product schema contract passed');
