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
	if (actual !== expected)
		throw new Error(label + ': expected ' + expected + ', received ' + actual);
}

function expectEqual(actual, expected, label) {
	if (actual !== expected)
		throw new Error(label + ': expected ' + expected + ', received ' + actual);
}

const migration = readFileSync(migrationPath, 'utf8');
if ((migration.match(/^begin;$/gm) ?? []).length !== 1) {
	throw new Error('Product dimensions migration must begin one transaction');
}
if ((migration.match(/^commit;$/gm) ?? []).length !== 1) {
	throw new Error('Product dimensions migration must commit one transaction');
}

const columns = JSON.parse(
	scalar(
		[
			'select coalesce(json_agg(json_build_object(',
			"	'column_name', column_name,",
			"	'data_type', data_type,",
			"	'is_nullable', is_nullable,",
			"	'column_default', column_default",
			") order by ordinal_position), '[]'::json)",
			'from information_schema.columns',
			"where table_schema = 'public'",
			"\tand table_name = 'quote_items'",
			'\tand column_name = any(array[',
			"\t\t'dimensions',",
			"\t\t'product_category_id_snapshot',",
			"\t\t'product_category_code_snapshot',",
			"\t\t'product_category_label_snapshot'",
			'\t])'
		].join('\n')
	)
);

expectEqual(columns.length, 4, 'QuoteItem dimension/category columns');
const byName = Object.fromEntries(columns.map((column) => [column.column_name, column]));
expectEqual(byName.dimensions.data_type, 'jsonb', 'QuoteItem dimensions type');
expectEqual(byName.dimensions.is_nullable, 'NO', 'QuoteItem dimensions nullability');
expectEqual(byName.dimensions.column_default, "'[]'::jsonb", 'QuoteItem dimensions default');
for (const name of [
	'product_category_id_snapshot',
	'product_category_code_snapshot',
	'product_category_label_snapshot'
]) {
	expectEqual(byName[name].is_nullable, 'YES', name + ' nullability');
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

sql(
	[
		'begin;',
		'do $$',
		'declare',
		"\tv_user_id uuid := '00000000-0000-0000-0000-000000000051';",
		"\tv_lead_id uuid := '00000000-0000-0000-0000-000000000052';",
		"\tv_quote_id uuid := '00000000-0000-0000-0000-000000000053';",
		"\tv_product_id uuid := '00000000-0000-0000-0000-000000000054';",
		"\tv_category_id uuid := '00000000-0000-0000-0000-000000000055';",
		'\tv_dimensions jsonb;',
		'\tv_invalid_dimensions jsonb := jsonb_build_array(',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true,"value":null,"extra":"nope"}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true,"value":null},{"key":"width","label":"Width again","unit":"mm","required":true,"value":null}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"cm","required":true,"value":"1500"}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true,"value":"0"}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true,"value":"-1"}]\'::jsonb,',
		'\t\t\'[{"key":"width","label":"Width","unit":"mm","required":true,"value":1500}]\'::jsonb',
		'\t);',
		'\tv_case jsonb;',
		'\tv_position integer := 4;',
		'begin',
		'\tinsert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)',
		"\tvalues (v_user_id, 'authenticated', 'authenticated', 'product-dimensions-schema@example.test', 'test-password', now(), '{\"full_name\":\"Product dimensions schema\"}'::jsonb);",
		"\tupdate public.profiles set role = 'owner', status = 'active' where id = v_user_id;",
		"\tinsert into public.leads (id, first_name, last_name, external_submission_id) values (v_lead_id, 'Dimensions', 'Schema', 'product-dimensions-schema-lead');",
		"\tinsert into public.quotes (id, lead_id, subject, created_by, quote_snapshot) values (v_quote_id, v_lead_id, 'Product dimensions schema', v_user_id, '{}'::jsonb);",
		'\tinsert into public.products (id, product_code, name, kind, unit_label, unit_price, status, activated_at, created_by)',
		"\tvalues (v_product_id, 'PRODUCT-DIMENSIONS-SCHEMA', 'Product dimensions schema fixture', 'product', 'each', 125.0000, 'active', now(), v_user_id);",
		'\tinsert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal, source_type)',
		"\tvalues (v_quote_id, 1, 'Custom schema fixture', 1, 10, 10, 'custom');",
		"\tif (select dimensions from public.quote_items where quote_id = v_quote_id and position = 1) <> '[]'::jsonb or (select product_category_id_snapshot from public.quote_items where quote_id = v_quote_id and position = 1) is not null or (select product_category_code_snapshot from public.quote_items where quote_id = v_quote_id and position = 1) is not null or (select product_category_label_snapshot from public.quote_items where quote_id = v_quote_id and position = 1) is not null then",
		"\t\traise exception 'Custom QuoteItem did not receive empty dimensions and nullable category snapshots';",
		'\tend if;',
		'\tv_dimensions := \'[{"key":"width","label":"Width","unit":"mm","required":true,"value":"1500"},{"key":"height","label":"Height","unit":"mm","required":true,"value":"900"}]\'::jsonb;',
		'\tinsert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, dimensions, product_category_id_snapshot, product_category_code_snapshot, product_category_label_snapshot)',
		"\tvalues (v_quote_id, 2, 'Catalogue schema fixture', 1, 125, 125, 'catalogue', v_product_id, 'PRODUCT-DIMENSIONS-SCHEMA', 'each', 125, 1, v_dimensions, v_category_id, 'SCHEMA-CATEGORY', 'Schema Category');",
		"\tif (select dimensions from public.quote_items where quote_id = v_quote_id and position = 2) <> v_dimensions or (select product_category_id_snapshot from public.quote_items where quote_id = v_quote_id and position = 2) <> v_category_id or (select product_category_code_snapshot from public.quote_items where quote_id = v_quote_id and position = 2) <> 'SCHEMA-CATEGORY' or (select product_category_label_snapshot from public.quote_items where quote_id = v_quote_id and position = 2) <> 'Schema Category' or exists (select 1 from public.product_categories where id = v_category_id) then",
		"\t\traise exception 'Catalogue QuoteItem did not retain historical dimensions/category snapshots';",
		'\tend if;',
		'\tinsert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, dimensions)',
		'\tvalues (v_quote_id, 3, \'Incomplete catalogue schema fixture\', 1, 125, 125, \'catalogue\', v_product_id, \'PRODUCT-DIMENSIONS-SCHEMA\', \'each\', 125, 1, \'[{"key":"width","label":"Width","unit":"mm","required":true,"value":null}]\'::jsonb);',
		"\tif (select dimensions -> 0 ->> 'value' from public.quote_items where quote_id = v_quote_id and position = 3) is not null then",
		"\t\traise exception 'Null draft dimension value was not retained';",
		'\tend if;',
		'\tfor v_case in select value from jsonb_array_elements(v_invalid_dimensions) loop',
		'\t\tbegin',
		'\t\t\tinsert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, dimensions)',
		"\t\t\tvalues (v_quote_id, v_position, 'Invalid catalogue schema fixture', 1, 125, 125, 'catalogue', v_product_id, 'PRODUCT-DIMENSIONS-SCHEMA', 'each', 125, 1, v_case);",
		"\t\t\traise exception 'Malformed dimensions unexpectedly accepted: %', v_case;",
		'\t\texception',
		'\t\t\twhen check_violation then',
		'\t\t\t\tnull;',
		'\t\tend;',
		'\t\tv_position := v_position + 1;',
		'\tend loop;',
		'end;',
		'$$;',
		'rollback;'
	].join('\n')
);

console.log('Product dimensions QuoteItem schema contract passed');
