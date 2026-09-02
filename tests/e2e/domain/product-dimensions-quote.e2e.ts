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
	readQuotesForLead,
	runCleanup,
	signIn,
	type StaffUser
} from './helpers';

type ProductFixture = { id: string; lockVersion: number };
type CategoryFixture = { id: string; lockVersion: number };
type QuoteFixture = { id: string; lock_version: number; status: string };

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for Product cleanup.');
	const value = line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
	const url = new URL(value);
	if (url.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
		throw new Error('Product cleanup requires a localhost PostgreSQL URL.');
	}
	return value;
}

function cleanupProductFixtures(productIds: string[], categoryIds: string[]): void {
	const ids = [...productIds, ...categoryIds];
	if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
		throw new Error('Invalid Product or ProductCategory cleanup ID.');
	}
	if (ids.length === 0) return;
	const products = productIds.map((id) => `'${id}'::uuid`).join(',');
	const categories = categoryIds.map((id) => `'${id}'::uuid`).join(',');
	const statements = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		products
			? `delete from public.activities where product_id in (${products}) or product_category_id in (${categories || 'null::uuid'})`
			: categories
				? `delete from public.activities where product_category_id in (${categories})`
				: '',
		products ? `delete from public.products where id in (${products})` : '',
		categories ? `delete from public.product_categories where id in (${categories})` : '',
		'alter table public.activities enable trigger activities_append_only',
		'commit'
	].filter(Boolean);
	execFileSync(
		'psql',
		[localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `${statements.join(';')};`],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
}

async function ingestStructuredLead(label: string): Promise<string> {
	const externalId = randomUUID();
	const response = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			form_id: process.env.BRICKS_FORM_ID?.trim() || 'aaa03e',
			external_submission_id: externalId,
			first_name: 'Product dimensions',
			last_name: 'Browser',
			email: `product-dimensions-${externalId}@example.test`,
			phone: '+27110000000',
			company: `Product dimensions ${label}`,
			message: 'Product: blinds | Width (mm): 1500 | Height (mm): 1200 | Openings: 3',
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
		if (!lead) throw new Error(`Could not load Lead ${leadId}.`);
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: lead.lock_version },
			user
		);
	}
}

async function createCategory(
	user: StaffUser,
	code: string,
	label: string
): Promise<CategoryFixture> {
	const result = (await authenticatedRpc(
		'create_product_category',
		{ p_code: code, p_label: label },
		user
	)) as { product_category_id: string; lock_version: number };
	return { id: result.product_category_id, lockVersion: result.lock_version };
}

async function createDimensionalProduct(
	user: StaffUser,
	code: string,
	name: string,
	categoryId: string,
	price: string
): Promise<ProductFixture> {
	const created = (await authenticatedRpc(
		'create_product',
		{
			p_product_code: code,
			p_name: name,
			p_customer_description: `${name} customer description`,
			p_internal_notes: `${name} private internal note`,
			p_kind: 'product',
			p_category_id: categoryId,
			p_unit_label: 'each',
			p_currency: 'ZAR',
			p_unit_price: price,
			p_taxable: true,
			p_dimensions_enabled: true,
			p_dimension_definitions: [
				{ key: 'width', label: 'Width', unit: 'mm', required: true },
				{ key: 'height', label: 'Height', unit: 'mm', required: true }
			]
		},
		user
	)) as { product_id: string; lock_version: number };
	const activated = (await authenticatedRpc(
		'activate_product',
		{ p_product_id: created.product_id, p_lock_version: created.lock_version },
		user
	)) as { product_id: string; lock_version: number };
	return { id: activated.product_id, lockVersion: activated.lock_version };
}

async function addProductLine(
	page: import('@playwright/test').Page,
	productName: string
): Promise<void> {
	await page.getByLabel('Search catalogue').fill(productName);
	const option = page.locator('.product-picker-option').filter({ hasText: productName });
	await expect(option).toBeVisible();
	await option.getByRole('button', { name: 'Use Product', exact: true }).click();
	await page.getByRole('button', { name: 'Add Product to quote', exact: true }).click();
	await page.waitForLoadState('networkidle');
}

async function saveDraft(page: import('@playwright/test').Page): Promise<void> {
	const navigation = page.waitForNavigation({ waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await navigation;
}

function dimensionLine(
	lines: import('@playwright/test').Locator,
	index: number
): import('@playwright/test').Locator {
	return lines.nth(index);
}

function quoteIdFromUrl(url: string): string {
	const match = new URL(url).pathname.match(/^\/quotes\/([0-9a-f-]{36})$/i);
	if (!match) throw new Error(`Quote detail URL was not reached: ${url}`);
	return match[1];
}

test('Product dimensions stay independent from enquiry through quote presentation and lifecycle', async ({
	page
}) => {
	test.setTimeout(180_000);
	const owner = await createStaff('owner', `product-dimensions-quote-${randomUUID().slice(0, 8)}`);
	const leadIds: string[] = [];
	const productIds: string[] = [];
	const categoryIds: string[] = [];

	try {
		const blinds = await createCategory(owner, `dimensions-${Date.now()}-blinds`, 'Blinds');
		categoryIds.push(blinds.id);
		const shutters = await createCategory(owner, `dimensions-${Date.now()}-shutters`, 'Shutters');
		categoryIds.push(shutters.id);

		await expect(
			authenticatedRpc(
				'create_product',
				{
					p_product_code: `DIM-SERVICE-${randomUUID().slice(0, 8)}`,
					p_name: 'Installation service',
					p_customer_description: 'A service cannot be dimensional',
					p_internal_notes: 'Service dimension rejection fixture',
					p_kind: 'service',
					p_category_id: blinds.id,
					p_unit_label: 'hour',
					p_currency: 'ZAR',
					p_unit_price: '500',
					p_taxable: true,
					p_dimensions_enabled: true,
					p_dimension_definitions: [{ key: 'width', label: 'Width', unit: 'mm', required: true }]
				},
				owner
			)
		).rejects.toThrow(/Services cannot use dimensions/);

		const blockoutCode = `BLINDS-DIM-${randomUUID().slice(0, 8)}`;
		const shutterCode = `SHUTTERS-DIM-${randomUUID().slice(0, 8)}`;
		const blockout = await createDimensionalProduct(
			owner,
			blockoutCode,
			'Blockout Blinds',
			blinds.id,
			'1500'
		);
		productIds.push(blockout.id);
		const security = await createDimensionalProduct(
			owner,
			shutterCode,
			'Security Shutters',
			shutters.id,
			'3000'
		);
		productIds.push(security.id);

		const leadId = await ingestStructuredLead('quote journey');
		leadIds.push(leadId);
		await moveLeadToDecision(leadId, owner);

		await expect(
			authenticatedRpc(
				'save_quote_draft',
				{
					p_quote_id: null,
					p_lock_version: null,
					p_lead_id: leadId,
					p_client_id: null,
					p_subject: 'Invalid custom dimension line',
					p_introduction: null,
					p_terms: null,
					p_tax_label: 'VAT',
					p_tax_rate: '15',
					p_valid_until: '2099-12-31',
					p_currency: 'ZAR',
					p_items: [
						{
							name: 'Custom line',
							quantity: '1',
							unit_price: '100',
							taxable: true,
							dimensions: [
								{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '100' }
							]
						}
					]
				},
				owner
			)
		).rejects.toThrow(/Custom Quote item 1 cannot use Product dimensions/);

		await signIn(page, owner);
		await page.goto(`/quotes/new?lead_id=${leadId}`, { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('heading', { name: 'Add from catalogue', exact: true })
		).toBeVisible();
		await expect(page.locator('.line-item')).toHaveCount(0);

		await addProductLine(page, 'Blockout Blinds');
		await addProductLine(page, 'Blockout Blinds');
		await addProductLine(page, 'Security Shutters');
		await expect(page.getByText('Temporary setup line', { exact: true })).toHaveCount(0);
		await expect(page.locator('.line-item')).toHaveCount(3);
		await page.getByLabel('Subject').fill('Window covering quote');
		await saveDraft(page);
		const draft = { quote_id: quoteIdFromUrl(page.url()) };

		let blindsLines = page.locator('.line-item').filter({ hasText: blockoutCode });
		let shuttersLine = page.locator('.line-item').filter({ hasText: shutterCode });
		await expect(blindsLines).toHaveCount(2);
		await expect(shuttersLine).toHaveCount(1);
		await expect(page.locator('.line-item')).toHaveCount(3);

		const enquiry = page.getByLabel('Read-only enquiry measurements');
		await expect(enquiry).toContainText('1500 mm');
		await expect(enquiry).toContainText('1200 mm');
		await expect(enquiry).toContainText('3');
		const measurementTarget = page.getByLabel('Apply Width/Height to line');
		const firstTargetValue = await measurementTarget.locator('option').nth(1).getAttribute('value');
		if (!firstTargetValue) throw new Error('The first dimensional line was not selectable.');
		await measurementTarget.selectOption(firstTargetValue);
		await page.getByRole('button', { name: 'Apply to line', exact: true }).click();
		await expect(dimensionLine(blindsLines, 0).getByLabel('Width (required)')).toHaveValue('1500');
		await expect(dimensionLine(blindsLines, 0).getByLabel('Height (required)')).toHaveValue('1200');

		await dimensionLine(blindsLines, 0).getByLabel('Width (required)').fill('1500');
		await dimensionLine(blindsLines, 0).getByLabel('Height (required)').fill('1500');
		await dimensionLine(blindsLines, 0).getByLabel('Full quoted price').fill('1500');
		await dimensionLine(blindsLines, 1).getByLabel('Width (required)').fill('1000');
		await dimensionLine(blindsLines, 1).getByLabel('Height (required)').fill('900');
		await dimensionLine(blindsLines, 1).getByLabel('Full quoted price').fill('1000');
		await shuttersLine.getByLabel('Width (required)').fill('2500');
		await shuttersLine.getByLabel('Height (required)').fill('1500');
		await shuttersLine.getByLabel('Full quoted price').fill('3000');
		await saveDraft(page);

		blindsLines = page.locator('.line-item').filter({ hasText: blockoutCode });
		shuttersLine = page.locator('.line-item').filter({ hasText: shutterCode });
		await expect(blindsLines).toHaveCount(2);
		await expect(shuttersLine).toHaveCount(1);
		for (const line of [
			dimensionLine(blindsLines, 0),
			dimensionLine(blindsLines, 1),
			shuttersLine
		]) {
			await expect(line.locator('input[type="hidden"][name^="quote-item-quantity-"]')).toHaveValue(
				'1'
			);
			await expect(line.locator('input[id^="quote-item-quantity-"]')).toHaveCount(0);
		}
		await expect(dimensionLine(blindsLines, 0).getByLabel('Full quoted price')).toHaveValue('1500');
		await expect(dimensionLine(blindsLines, 1).getByLabel('Full quoted price')).toHaveValue('1000');
		await expect(shuttersLine.getByLabel('Full quoted price')).toHaveValue('3000');

		const preview = page.getByTestId('quote-document-preview');
		await expect(preview.locator('tbody[aria-label="Blinds"]')).toHaveCount(1);
		await expect(preview.locator('tbody[aria-label="Shutters"]')).toHaveCount(1);
		await expect(preview.locator('tbody[aria-label="Blinds"] .category-heading')).toHaveCount(1);
		await expect(preview.locator('tbody[aria-label="Shutters"] .category-heading')).toHaveCount(1);
		await expect(preview.locator('tbody[aria-label="Blinds"] .item-line')).toHaveCount(2);
		await expect(preview.locator('tbody[aria-label="Shutters"] .item-line')).toHaveCount(1);
		await expect(preview.locator('tbody[aria-label="Blinds"] .category-heading')).not.toContainText(
			'ZAR'
		);
		await expect(
			preview.locator('tbody[aria-label="Shutters"] .category-heading')
		).not.toContainText('ZAR');
		await expect(preview).toContainText('Width: 1500 mm × Height: 1500 mm');
		await expect(preview).toContainText('Width: 1000 mm × Height: 900 mm');
		await expect(preview).toContainText('Width: 2500 mm × Height: 1500 mm');
		const previewText = await preview.innerText();
		expect(previewText).toMatch(/ZAR\s+1[ ,\u00a0]500,00/);
		expect(previewText).toMatch(/ZAR\s+1[ ,\u00a0]000,00/);
		expect(previewText).toMatch(/ZAR\s+3[ ,\u00a0]000,00/);
		expect(await page.locator('body').innerText()).not.toContain('private internal note');
		await expect(preview.locator('.item-line')).toHaveCount(3);

		await dimensionLine(blindsLines, 1).getByLabel('Width (required)').fill('');
		await saveDraft(page);
		await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
		await expect(
			page
				.getByText('A ready Quote requires all required Product dimensions', { exact: true })
				.first()
		).toBeVisible();
		await expect(
			dimensionLine(page.locator('.line-item').filter({ hasText: blockoutCode }), 1).getByRole(
				'alert'
			)
		).toContainText('A ready Quote requires all required Product dimensions');

		blindsLines = page.locator('.line-item').filter({ hasText: blockoutCode });
		await dimensionLine(blindsLines, 1).getByLabel('Width (required)').fill('1000');
		await saveDraft(page);

		await authenticatedRpc(
			'update_product_category',
			{
				p_category_id: blinds.id,
				p_lock_version: blinds.lockVersion,
				p_code: `dimensions-${Date.now()}-blinds-updated`,
				p_label: 'Blinds catalogue changed',
				p_sort_order: 0
			},
			owner
		);
		const changedProduct = (await authenticatedRpc(
			'change_product_price',
			{
				p_product_id: blockout.id,
				p_lock_version: blockout.lockVersion,
				p_unit_price: '1750',
				p_reason: 'Product dimensions stale review browser proof'
			},
			owner
		)) as { lock_version: number };
		blockout.lockVersion = changedProduct.lock_version;
		await page.reload({ waitUntil: 'networkidle' });
		await expect(
			page.getByText('Product changed since this line was added', { exact: true })
		).toHaveCount(2);
		await expect(page.getByRole('button', { name: 'Keep Quoted Values', exact: true })).toHaveCount(
			2
		);

		for (let index = 0; index < 2; index += 1) {
			await page.getByRole('button', { name: 'Keep Quoted Values', exact: true }).first().click();
			await page.waitForLoadState('networkidle');
		}
		await expect(
			page.getByText('Product changed since this line was added', { exact: true })
		).toHaveCount(0);
		blindsLines = page.locator('.line-item').filter({ hasText: blockoutCode });
		await expect(dimensionLine(blindsLines, 0).getByLabel('Width (required)')).toHaveValue('1500');
		await expect(dimensionLine(blindsLines, 0).getByLabel('Height (required)')).toHaveValue('1500');
		await expect(dimensionLine(blindsLines, 1).getByLabel('Width (required)')).toHaveValue('1000');
		await expect(dimensionLine(blindsLines, 1).getByLabel('Height (required)')).toHaveValue('900');
		await expect(dimensionLine(blindsLines, 0).getByLabel('Full quoted price')).toHaveValue('1500');
		await expect(dimensionLine(blindsLines, 1).getByLabel('Full quoted price')).toHaveValue('1000');
		await expect(dimensionLine(blindsLines, 0).getByText('Blinds', { exact: true })).toBeVisible();
		await expect(
			page.getByTestId('quote-document-preview').locator('tbody[aria-label="Blinds"]')
		).toHaveCount(1);
		await expect(page.getByTestId('quote-document-preview')).not.toContainText(
			'Blinds catalogue changed'
		);

		const readyNavigation = page.waitForNavigation({ waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
		await readyNavigation;
		const readyQuotes = (await readQuotesForLead(leadId, owner)) as Array<QuoteFixture>;
		const readyQuote = readyQuotes.find((quote) => quote.id === draft.quote_id);
		if (!readyQuote) throw new Error('The ready Quote was not returned by the local API.');
		await expect(page.getByRole('button', { name: 'Send quote', exact: true })).toBeVisible();
		await expect(page.getByTestId('quote-document-preview')).toContainText(
			'Width: 1500 mm × Height: 1500 mm'
		);
		await expect(page.getByTestId('quote-document-preview')).toContainText(
			'Width: 1000 mm × Height: 900 mm'
		);
		await expect(page.getByTestId('quote-document-preview')).toContainText(
			'Width: 2500 mm × Height: 1500 mm'
		);

		const outbound = (await authenticatedRpc(
			'prepare_quote_send',
			{ p_quote_id: draft.quote_id, p_lock_version: readyQuote.lock_version },
			owner
		)) as { outbound_message_id: string };
		await authenticatedRpc(
			'complete_quote_send',
			{
				p_outbound_message_id: outbound.outbound_message_id,
				p_provider_message_id: `product-dimensions-${randomUUID()}`
			},
			owner
		);
		const sentQuotes = (await readQuotesForLead(leadId, owner)) as Array<QuoteFixture>;
		const sentQuote = sentQuotes.find((quote) => quote.id === draft.quote_id);
		if (!sentQuote) throw new Error('The sent Quote was not returned by the local API.');
		await expect(
			authenticatedRpc(
				'save_quote_draft',
				{
					p_quote_id: draft.quote_id,
					p_lock_version: sentQuote.lock_version,
					p_lead_id: leadId,
					p_client_id: null,
					p_subject: 'Window covering quote',
					p_introduction: null,
					p_terms: null,
					p_tax_label: 'VAT',
					p_tax_rate: '15',
					p_valid_until: '2099-12-31',
					p_currency: 'ZAR',
					p_items: []
				},
				owner
			)
		).rejects.toThrow(/Only draft or ready Quotes can be edited/);
	} finally {
		await runCleanup([
			...leadIds.map((leadId) => ({
				label: `Lead ${leadId}`,
				run: () => cleanupLeadData(leadId)
			})),
			{
				label: 'Product and category fixtures',
				run: async () => cleanupProductFixtures(productIds, categoryIds)
			},
			{ label: `auth user ${owner.id}`, run: () => cleanupUser(owner.id) }
		]);
	}
});
