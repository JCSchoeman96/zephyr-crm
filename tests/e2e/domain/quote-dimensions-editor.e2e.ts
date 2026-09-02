import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
	appUrl,
	authenticatedRpc,
	bricksSecret,
	cleanupLeadData,
	cleanupUser,
	createStaff,
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
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for Quote cleanup.');
	const value = line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
	const url = new URL(value);
	if (url.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
		throw new Error('Quote cleanup requires a localhost PostgreSQL URL.');
	}
	return value;
}

function cleanupProductFixtures(productIds: string[]): void {
	if (productIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
		throw new Error('Invalid Quote dimension Product cleanup ID.');
	}
	if (productIds.length === 0) return;
	const ids = productIds.map((id) => `'${id}'::uuid`).join(',');
	const query = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		`delete from public.activities where product_id in (${ids})`,
		`delete from public.products where id in (${ids})`,
		'alter table public.activities enable trigger activities_append_only',
		'commit'
	].join(';');
	execFileSync('psql', [localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `${query};`], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

async function ingestStructuredLead(label: string) {
	const externalId = randomUUID();
	const response = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			form_id: process.env.BRICKS_FORM_ID?.trim() || 'aaa03e',
			external_submission_id: externalId,
			first_name: 'Dimensions',
			last_name: 'Browser',
			email: `dimensions-${externalId}@example.test`,
			phone: '+27110000000',
			company: `Dimensions ${label}`,
			message: 'Product: blinds | Width (mm): 1500 | Height (mm): 1200 | Openings: 2',
			source: 'bricks'
		})
	});
	const body = (await response.json()) as { lead_id?: string };
	if (response.status !== 201 || !body.lead_id) {
		throw new Error(`Structured browser intake failed (${response.status}).`);
	}
	return body.lead_id;
}

async function moveLeadToDecision(leadId: string, user: StaffUser): Promise<void> {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const lead = await readLead(leadId, user);
		if (!lead) throw new Error('Could not load the Quote dimension Lead fixture.');
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: lead.lock_version },
			user
		);
	}
}

test('quote editor carries enquiry dimensions through a draft and exposes readiness feedback', async ({
	page
}) => {
	test.setTimeout(120_000);
	const owner = await createStaff('owner', `quote-dimensions-editor-${randomUUID().slice(0, 8)}`);
	const leadIds: string[] = [];
	const productIds: string[] = [];

	try {
		const leadId = await ingestStructuredLead('editor');
		leadIds.push(leadId);
		await moveLeadToDecision(leadId, owner);

		const draft = (await authenticatedRpc(
			'save_quote_draft',
			{
				p_quote_id: null,
				p_lock_version: null,
				p_lead_id: leadId,
				p_client_id: null,
				p_subject: 'Quote dimensions editor',
				p_introduction: 'Focused editor regression',
				p_terms: 'Terms',
				p_tax_label: 'VAT',
				p_tax_rate: '15',
				p_valid_until: '2099-12-31',
				p_currency: 'ZAR',
				p_items: [
					{
						name: 'Existing custom line',
						description: 'Custom remains dimensionless',
						quantity: '1',
						unit_price: '100',
						taxable: true
					}
				]
			},
			owner
		)) as { quote_id: string };

		const productCode = `QUOTE-DIM-${randomUUID().slice(0, 8)}`;
		const created = (await authenticatedRpc(
			'create_product',
			{
				p_product_code: productCode,
				p_name: 'Dimensional editor Product',
				p_customer_description: 'Configured editor Product',
				p_internal_notes: 'Private editor fixture note',
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
		await authenticatedRpc(
			'activate_product',
			{ p_product_id: created.product_id, p_lock_version: created.lock_version },
			owner
		);

		await signIn(page, owner);
		await page.goto(`/quotes/${draft.quote_id}`, { waitUntil: 'networkidle' });
		await page.getByLabel('Search catalogue').fill('Dimensional editor Product');
		const option = page.locator('.product-picker-option').filter({
			hasText: 'Dimensional editor Product'
		});
		await expect(option).toBeVisible();
		await option.getByRole('button', { name: 'Use Product', exact: true }).click();
		await page.getByRole('button', { name: 'Add Product to quote', exact: true }).click();
		await page.waitForLoadState('networkidle');

		const dimensionalLine = page.locator('.line-item').filter({ hasText: productCode });
		await expect(dimensionalLine).toHaveCount(1);
		await expect(dimensionalLine.getByLabel('Width (required)')).toBeVisible();
		await expect(dimensionalLine.getByLabel('Height (required)')).toBeVisible();
		await expect(dimensionalLine.getByText('1', { exact: true })).toBeVisible();
		await expect(dimensionalLine.getByLabel('Full quoted price')).toBeVisible();
		await expect(page.getByText('1500 mm', { exact: true })).toBeVisible();
		await expect(page.getByText('1200 mm', { exact: true })).toBeVisible();
		await expect(page.getByText('Openings', { exact: true })).toBeVisible();
		await expect(
			page.getByLabel('Read-only enquiry measurements').getByText('2', { exact: true })
		).toBeVisible();

		const itemsField = page.locator('input[name="items"]');
		const beforeApply = JSON.parse(await itemsField.inputValue()) as Array<Record<string, unknown>>;
		const customBefore = beforeApply.find((item) => item.name === 'Existing custom line');
		expect(customBefore).not.toHaveProperty('dimensions');

		await page.getByLabel('Apply Width/Height to line').selectOption({
			label: 'Dimensional editor Product'
		});
		await page.getByRole('button', { name: 'Apply to line', exact: true }).click();
		const afterApply = JSON.parse(await itemsField.inputValue()) as Array<Record<string, unknown>>;
		const dimensionalAfterApply = afterApply.find(
			(item) => item.name === 'Dimensional editor Product'
		);
		expect(dimensionalAfterApply?.dimensions).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' },
			{ key: 'height', label: 'Height', unit: 'mm', required: true, value: '1200' }
		]);
		expect(afterApply.filter((item) => item.dimensions).length).toBe(1);

		await dimensionalLine.getByLabel('Width (required)').fill('');
		await dimensionalLine.getByLabel('Full quoted price').fill('1400');
		const saveRequestPromise = page.waitForRequest(
			(request) =>
				request.method() === 'POST' && request.url().includes(`/quotes/${draft.quote_id}?/save`)
		);
		const saveNavigationPromise = page.waitForNavigation({ waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		const [saveRequest, saveResponse] = await Promise.all([
			saveRequestPromise,
			saveNavigationPromise
		]);
		expect(saveResponse?.ok()).toBe(true);
		expect(page.url()).toBe(`${appUrl}/quotes/${draft.quote_id}`);
		const submittedItems = JSON.parse(
			new URLSearchParams(saveRequest.postData() ?? '').get('items') ?? '[]'
		) as Array<Record<string, unknown>>;
		const submittedDimensionalLine = submittedItems.find(
			(item) => item.name === 'Dimensional editor Product'
		);
		expect(submittedDimensionalLine?.unit_price).toBe('1400');
		expect(submittedDimensionalLine?.dimensions).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', required: true, value: null },
			{ key: 'height', label: 'Height', unit: 'mm', required: true, value: '1200' }
		]);
		const reloadedDimensionalLine = page.locator('.line-item').filter({ hasText: productCode });
		await expect(reloadedDimensionalLine.getByLabel('Width (required)')).toHaveValue('');
		await expect(reloadedDimensionalLine.getByLabel('Full quoted price')).toHaveValue('1400');

		await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
		await expect(
			page
				.locator('.ui-state__message')
				.filter({ hasText: 'A ready Quote requires all required Product dimensions' })
		).toBeVisible();
		await expect(
			page.locator('.line-item').filter({ hasText: productCode }).getByRole('alert')
		).toContainText('A ready Quote requires all required Product dimensions');
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
