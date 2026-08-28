import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260828110000_v150_quote_item_snapshots.sql';
const baselineCommit = 'e7828f2';

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
	throw new Error('P23 QuoteItem migration must begin one transaction');
}
if ((migration.match(/^commit;$/gm) ?? []).length !== 1) {
	throw new Error('P23 QuoteItem migration must commit one transaction');
}

const changedMigrations = run('git', [
	'diff',
	'--name-only',
	`${baselineCommit}..HEAD`,
	'--',
	'supabase/migrations'
])
	.split(/\r?\n/)
	.filter(Boolean);
const historicalChanges = changedMigrations.filter((path) => path !== migrationPath);
if (historicalChanges.length > 0) {
	throw new Error(`Historical migrations changed: ${historicalChanges.join(', ')}`);
}

const requiredColumns = [
	'source_type',
	'product_id',
	'product_code_snapshot',
	'unit_label_snapshot',
	'catalogue_unit_price',
	'source_product_version',
	'source_product_reviewed_version',
	'source_product_reviewed_at',
	'source_product_reviewed_by'
];
expectCount(
	`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'quote_items' and column_name = any(array[${requiredColumns.map((name) => `'${name}'`).join(',')}])`,
	requiredColumns.length,
	'QuoteItem source columns'
);
expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'quote_items' and column_name = 'source_type' and is_nullable = 'NO' and column_default like '%custom%'",
	1,
	'QuoteItem custom compatibility default'
);
expectCount(
	"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'quote_items' and column_name = 'catalogue_unit_price' and data_type = 'numeric' and numeric_precision = 19 and numeric_scale = 4",
	1,
	'Catalogue price precision'
);
expectCount(
	"select count(*) from pg_indexes where schemaname = 'public' and indexname in ('quote_items_product_id_idx', 'quote_items_quote_position_idx')",
	2,
	'QuoteItem source indexes'
);
expectCount(
	"select count(*) from pg_constraint where conname in ('quote_items_source_type_check', 'quote_items_source_contract', 'quote_items_review_evidence_check', 'quote_items_product_id_fkey', 'quote_items_source_product_reviewed_by_fkey')",
	5,
	'QuoteItem source constraints'
);
expectCount(
	"select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'add_product_quote_item'",
	1,
	'Product selection RPC'
);
expectCount(
	"select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'add_product_quote_item' and grantee = 'authenticated' and privilege_type = 'EXECUTE'",
	1,
	'Product selection RPC grant'
);
expectCount(
	"select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'quote_items' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')",
	0,
	'Raw QuoteItem writes'
);

console.log('P23 QuoteItem snapshot schema contract passed');
