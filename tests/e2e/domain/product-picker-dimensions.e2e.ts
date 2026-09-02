import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLeadData,
	cleanupUser,
	createStaff,
	ingestLead,
	readLead,
	runCleanup,
	signIn,
	type StaffUser
} from './helpers';

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for Product cleanup.');
	return line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
}

function cleanupProductFixtures(productIds: string[]): void {
	if (productIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
		throw new Error('Invalid Product cleanup ID.');
	if (productIds.length === 0) return;
	const products = productIds.map((id) => `'${id}'::uuid`).join(',');
	const query = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		`delete from public.activities where product_id in (${products})`,
		`delete from public.products where id in (${products})`,
		'alter table public.activities enable trigger activities_append_only',
		'commit'
	].join(';');
	execFileSync('psql', [localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `${query};`], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

async function moveLeadToDecision(leadId: string, user: StaffUser): Promise<void> {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await readLead(leadId, user);
		if (!current) throw new Error(`Could not read Lead ${leadId}.`);
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			user
		);
	}
}

test('dimensional Product picker shows measurements and submits only Product identity fields', async ({
	page
}) => {
	test.setTimeout(90_000);
	const owner = await createStaff('owner', 'product-picker-dimensions');
	const leadIds: string[] = [];
	const productIds: string[] = [];
	const suffix = randomUUID().slice(0, 8);

	try {
		const lead = await ingestLead(`product-picker-dimensions-${suffix}`);
		leadIds.push(lead.id);
		await moveLeadToDecision(lead.id, owner);

		const draft = (await authenticatedRpc(
			'save_quote_draft',
			{
				p_quote_id: null,
				p_lock_version: null,
				p_lead_id: lead.id,
				p_client_id: null,
				p_subject: 'Dimensional Product picker quote',
				p_introduction: 'Product picker regression fixture',
				p_terms: 'Terms',
				p_tax_label: 'VAT',
				p_tax_rate: '15',
				p_valid_until: '2099-12-31',
				p_currency: 'ZAR',
				p_items: [
					{
						name: 'Existing custom line',
						quantity: '1',
						unit_price: '10.0000',
						taxable: true
					}
				]
			},
			owner
		)) as { quote_id: string };

		const created = (await authenticatedRpc(
			'create_product',
			{
				p_product_code: `PICKER-DIM-${suffix}`,
				p_name: 'Dimensional picker Product',
				p_customer_description: 'Product picker dimensions',
				p_internal_notes: 'Picker test private note',
				p_kind: 'product',
				p_unit_label: 'each',
				p_currency: 'ZAR',
				p_unit_price: '1500.0000',
				p_taxable: true,
				p_dimensions_enabled: true,
				p_dimension_definitions: [
					{ key: 'width', label: 'Width', unit: 'mm', required: true },
					{ key: 'height', label: 'Height', unit: 'mm', required: true }
				]
			},
			owner
		)) as { product_id: string; lock_version: number };
		productIds.push(created.product_id);
		const activated = (await authenticatedRpc(
			'activate_product',
			{ p_product_id: created.product_id, p_lock_version: created.lock_version },
			owner
		)) as { product_id: string; lock_version: number };

		await signIn(page, owner);
		await page.goto(`/quotes/${draft.quote_id}`, { waitUntil: 'networkidle' });
		await page.getByLabel('Search catalogue').fill(`PICKER-DIM-${suffix}`);

		const option = page.locator('.product-picker-option').filter({
			hasText: 'Dimensional picker Product'
		});
		await expect(option).toBeVisible();
		await expect(option).toContainText('Required: Width (mm), Height (mm)');
		await option.getByRole('button', { name: 'Use Product', exact: true }).click();

		await expect(page.getByLabel('Catalogue quantity')).toHaveCount(0);
		await expect(page.locator('.selected-product-measurements')).toContainText(
			'Required: Width (mm), Height (mm)'
		);

		const addRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().includes(`/quotes/${draft.quote_id}?/addProduct`)
		);
		await page.getByRole('button', { name: 'Add Product to quote', exact: true }).click();
		const request = await addRequest;
		const submitted = new URLSearchParams(request.postData() ?? '');

		expect(submitted.get('product_id')).toBe(activated.product_id);
		expect(submitted.get('product_lock_version')).toBe(String(activated.lock_version));
		const pickerFields = [
			'product_id',
			'product_lock_version',
			'quantity',
			'dimensions',
			'dimension_definitions',
			'kind',
			'name',
			'unit_price',
			'category_id'
		];
		expect(pickerFields.filter((field) => submitted.has(field))).toEqual([
			'product_id',
			'product_lock_version'
		]);
	} finally {
		await runCleanup([
			...leadIds.map((leadId) => ({
				label: `Lead ${leadId}`,
				run: () => cleanupLeadData(leadId)
			})),
			{ label: 'Product fixtures', run: async () => cleanupProductFixtures(productIds) },
			{ label: `auth user ${owner.id}`, run: () => cleanupUser(owner.id) }
		]);
	}
});
