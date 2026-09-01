import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260901100000_product_dimensions_and_quote_lines.sql';

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

function expectEqual(actual, expected, label) {
	if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

const migration = readFileSync(migrationPath, 'utf8');
if ((migration.match(/^begin;$/gm) ?? []).length !== 1) {
	throw new Error('Product dimensions migration must begin one transaction');
}
if ((migration.match(/^commit;$/gm) ?? []).length !== 1) {
	throw new Error('Product dimensions migration must commit one transaction');
}

const columns = JSON.parse(
	scalar(`
		select coalesce(json_agg(json_build_object(
			'column_name', column_name,
			'data_type', data_type,
			'is_nullable', is_nullable,
			'default', column_default
		) order by ordinal_position), '[]'::json)
		from information_schema.columns
		where table_schema = 'public'
			and table_name = 'quote_items'
			and column_name = any(array[
				'dimensions',
				'product_category_id_snapshot',
				'product_category_code_snapshot',
				'product_category_label_snapshot'
			])
	`)
);

expectEqual(columns.length, 4, 'QuoteItem dimension/category columns');
const byName = Object.fromEntries(columns.map((column) => [column.column_name, column]));
expectEqual(byName.dimensions.data_type, 'jsonb', 'QuoteItem dimensions type');
expectEqual(byName.dimensions.is_nullable, 'NO', 'QuoteItem dimensions nullability');
expectEqual(byName.dimensions.default, "'[]'::jsonb", 'QuoteItem dimensions default');
for (const name of [
	'product_category_id_snapshot',
	'product_category_code_snapshot',
	'product_category_label_snapshot'
]) {
	expectEqual(byName[name].is_nullable, 'YES', `${name} nullability`);
}

expectCount(
	"select count(*) from pg_constraint where conrelid = 'public.quote_items'::regclass and conname in ('quote_items_dimensions_array_check', 'quote_items_dimensions_snapshot_check')",
	2,
	'QuoteItem dimension constraints'
);
expectCount(
	"select count(*) from pg_constraint where conrelid = 'public.quote_items'::regclass and conname in ('quote_items_source_type_check', 'quote_items_source_contract', 'quote_items_review_evidence_check', 'quote_items_source_product_version_check', 'quote_items_source_reviewed_version_check')",
	5,
	'Existing QuoteItem source constraints'
);
expectCount(
	"select count(*) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.conrelid = 'public.quote_items'::regclass and c.contype = 'f' and a.attname = 'product_category_id_snapshot'",
	0,
	'Historical category snapshot foreign key'
);
expectCount(
	"select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'quote_items' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')",
	0,
	'Raw QuoteItem writes'
);

const shapeDefinition = scalar(
	"select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.quote_items'::regclass and conname = 'quote_items_dimensions_snapshot_check'"
);
if (!shapeDefinition.includes('is_valid_quote_item_dimensions')) {
	throw new Error('QuoteItem dimension snapshot check does not use the canonical validator');
}

console.log('Product dimensions QuoteItem schema contract passed');
