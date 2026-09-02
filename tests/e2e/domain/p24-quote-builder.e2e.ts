import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLeadData,
	cleanupUser,
	createStaff,
	ingestLead,
	readLead,
	readQuotesForLead,
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
	return line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
}

function cleanupProductFixtures(productIds: string[], categoryIds: string[]): void {
	const ids = [...productIds, ...categoryIds];
	if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
		throw new Error('Invalid P24 Product cleanup ID.');
	}
	if (ids.length === 0) return;
	const products = productIds.map((id) => "'" + id + "'::uuid").join(',');
	const categories = categoryIds.map((id) => "'" + id + "'::uuid").join(',');
	const statements = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		products ? 'delete from public.activities where product_id in (' + products + ')' : '',
		categories
			? 'delete from public.activities where product_category_id in (' + categories + ')'
			: '',
		products ? 'delete from public.products where id in (' + products + ')' : '',
		categories ? 'delete from public.product_categories where id in (' + categories + ')' : '',
		'alter table public.activities enable trigger activities_append_only',
		'commit'
	].filter(Boolean);
	execFileSync(
		'psql',
		[localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', statements.join(';') + ';'],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
}

async function moveLeadToDecision(leadId: string, user: StaffUser): Promise<void> {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await readLead(leadId, user);
		if (!current) throw new Error('Could not read Lead ' + leadId + '.');
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			user
		);
	}
}

async function createActiveProduct(
	user: StaffUser,
	code: string,
	name: string,
	categoryId: string,
	currency = 'ZAR'
): Promise<{ id: string; lockVersion: number }> {
	const created = (await authenticatedRpc(
		'create_product',
		{
			p_product_code: code,
			p_name: name,
			p_customer_description: name + ' customer description',
			p_internal_notes: name + ' private internal note',
			p_kind: 'service',
			p_category_id: categoryId,
			p_unit_label: 'hour',
			p_currency: currency,
			p_unit_price: '125.5000',
			p_taxable: true
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

type SearchBody = {
	products: Array<Record<string, unknown>>;
	pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

async function searchProducts(
	page: import('@playwright/test').Page,
	query: string
): Promise<{ status: number; body: SearchBody }> {
	return page.evaluate(async (path) => {
		const response = await fetch(path);
		return { status: response.status, body: (await response.json()) as SearchBody };
	}, query);
}

test('Quote builder searches bounded active Products, preserves custom lines, and adds a catalogue line', async ({
	page
}) => {
	test.setTimeout(120_000);
	const owner = await createStaff('owner', 'p24-builder-browser');
	const leadIds: string[] = [];
	const productIds: string[] = [];
	const categoryIds: string[] = [];
	let firstProduct: { id: string; lockVersion: number } | null = null;

	try {
		const categoryA = (await authenticatedRpc(
			'create_product_category',
			{ p_code: 'p24-' + Date.now() + '-a', p_label: 'P24 Services' },
			owner
		)) as { product_category_id: string };
		const categoryB = (await authenticatedRpc(
			'create_product_category',
			{ p_code: 'p24-' + Date.now() + '-b', p_label: 'P24 Other' },
			owner
		)) as { product_category_id: string };
		categoryIds.push(categoryA.product_category_id, categoryB.product_category_id);

		for (let index = 1; index <= 13; index += 1) {
			const sequence = String(index).padStart(2, '0');
			const product = await createActiveProduct(
				owner,
				'P24-BROWSER-' + sequence,
				'P24 Searchable ' + sequence,
				categoryA.product_category_id
			);
			if (index === 1) firstProduct = product;
			productIds.push(product.id);
		}
		const inactive = (await authenticatedRpc(
			'create_product',
			{
				p_product_code: 'P24-BROWSER-INACTIVE',
				p_name: 'P24 Hidden Product',
				p_customer_description: 'Should not be selectable',
				p_internal_notes: 'Hidden Product private note',
				p_kind: 'service',
				p_category_id: categoryB.product_category_id,
				p_unit_label: 'job',
				p_currency: 'ZAR',
				p_unit_price: '9.0000',
				p_taxable: false
			},
			owner
		)) as { product_id: string };
		productIds.push(inactive.product_id);
		const usd = await createActiveProduct(
			owner,
			'P24-BROWSER-USD',
			'P24 USD Product',
			categoryB.product_category_id,
			'USD'
		);
		productIds.push(usd.id);

		const lead = await ingestLead('p24-builder-browser');
		leadIds.push(lead.id);
		await moveLeadToDecision(lead.id, owner);
		const draft = (await authenticatedRpc(
			'save_quote_draft',
			{
				p_quote_id: null,
				p_lock_version: null,
				p_lead_id: lead.id,
				p_client_id: null,
				p_subject: 'P24 browser quote',
				p_introduction: 'P24 quote builder browser proof',
				p_terms: 'P24 terms',
				p_tax_label: 'VAT',
				p_tax_rate: '15',
				p_valid_until: '2099-12-31',
				p_currency: 'ZAR',
				p_items: [
					{
						name: 'Custom setup line',
						description: 'Custom line remains legal',
						quantity: '1',
						unit_price: '10.0000',
						taxable: true
					}
				]
			},
			owner
		)) as { quote_id: string };

		await signIn(page, owner);
		await page.goto('/quotes/' + draft.quote_id, { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('heading', { name: 'Add from catalogue', exact: true })
		).toBeVisible();

		const baseSearch = '/api/products/search?currency=ZAR&q=P24-BROWSER&page_size=12&page=1';
		const firstPage = await searchProducts(page, baseSearch);
		expect(firstPage.status).toBe(200);
		expect(firstPage.body.pagination).toMatchObject({ page: 1, pageSize: 12, total: 13 });
		expect(firstPage.body.products).toHaveLength(12);
		expect(
			firstPage.body.products.every(
				(product: Record<string, unknown>) => product.currency === 'ZAR'
			)
		).toBe(true);
		expect(
			firstPage.body.products.every(
				(product: Record<string, unknown>) => !('internal_notes' in product)
			)
		).toBe(true);
		expect(JSON.stringify(firstPage.body)).not.toContain('private internal note');

		const secondPage = await searchProducts(
			page,
			'/api/products/search?currency=ZAR&q=P24-BROWSER&page_size=12&page=2'
		);
		expect(secondPage.status).toBe(200);
		expect(secondPage.body.products).toHaveLength(1);
		expect(secondPage.body.products[0].product_code).toBe('P24-BROWSER-13');

		const categoryPage = await searchProducts(
			page,
			'/api/products/search?currency=ZAR&category_id=' +
				categoryA.product_category_id +
				'&page_size=12&page=1'
		);
		expect(categoryPage.status).toBe(200);
		expect(categoryPage.body.pagination.total).toBe(13);

		const noResults = await searchProducts(
			page,
			'/api/products/search?currency=ZAR&q=does-not-exist&page_size=12&page=1'
		);
		expect(noResults.status).toBe(200);
		expect(noResults.body.products).toHaveLength(0);
		await page.getByLabel('Search catalogue').fill('does-not-exist');
		await expect(
			page.getByText('No active Products match this search.', { exact: true })
		).toBeVisible();

		await page.getByLabel('Search catalogue').fill('P24-BROWSER-01');
		await expect(page.getByText('P24 Searchable 01', { exact: true })).toBeVisible();
		const productOption = page
			.locator('.product-picker-option')
			.filter({ hasText: 'P24 Searchable 01' });
		await productOption.getByRole('button', { name: 'Use Product', exact: true }).click();
		await page.getByLabel('Catalogue quantity').fill('2.1250');
		await page.getByRole('button', { name: 'Add Product to quote', exact: true }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('P24 Searchable 01', { exact: true })).toHaveCount(1);
		await expect(page.getByText('Catalogue line', { exact: true })).toBeVisible();
		await expect(page.getByText('Custom setup line', { exact: true })).toBeVisible();
		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toContain('private internal note');

		if (!firstProduct) throw new Error('P24 browser Product fixture was not created.');
		await page.locator('#quote-item-quantity-1').fill('2.1250');
		await page.locator('#quote-item-description-1').fill('Negotiated customer description');
		await page.locator('#quote-item-price-1').fill('111.1100');
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		await page.waitForLoadState('networkidle');
		let productLine = page.locator('.line-item').filter({ hasText: 'P24-BROWSER-01' });
		await expect(productLine.locator('#quote-item-quantity-1')).toHaveValue('2.125');
		await expect(productLine.locator('#quote-item-price-1')).toHaveValue('111.11');
		await expect(productLine.locator('#quote-item-description-1')).toHaveValue(
			'Negotiated customer description'
		);

		await page.getByRole('button', { name: 'Move item 2 up', exact: true }).click();
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		await page.waitForLoadState('networkidle');
		productLine = page.locator('.line-item').filter({ hasText: 'P24-BROWSER-01' });
		await expect(productLine.locator('#quote-item-quantity-0')).toHaveValue('2.125');
		await expect(page.locator('#quote-item-name-1')).toHaveValue('Custom setup line');

		const changed = (await authenticatedRpc(
			'update_product',
			{
				p_product_id: firstProduct.id,
				p_lock_version: firstProduct.lockVersion,
				p_product_code: 'P24-BROWSER-01-UPDATED',
				p_name: 'Updated P24 Product',
				p_customer_description: 'Updated P24 customer description',
				p_internal_notes: 'Updated P24 private internal note',
				p_kind: 'service',
				p_category_id: categoryA.product_category_id,
				p_unit_label: 'session',
				p_currency: 'ZAR',
				p_taxable: false
			},
			owner
		)) as { product_id: string; lock_version: number };
		firstProduct = { id: changed.product_id, lockVersion: changed.lock_version };
		await page.reload({ waitUntil: 'networkidle' });
		await expect(
			page.getByText('Product changed since this line was added', { exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Refresh from Catalogue', exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Keep Quoted Values', exact: true })
		).toBeVisible();

		await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
		await expect(
			page.getByText('Quote has unresolved Product source changes', { exact: true })
		).toBeVisible();

		await page.getByRole('button', { name: 'Refresh from Catalogue', exact: true }).click();
		await page.waitForLoadState('networkidle');
		productLine = page.locator('.line-item').filter({ hasText: 'P24-BROWSER-01-UPDATED' });
		await expect(productLine).toContainText('P24-BROWSER-01-UPDATED');
		await expect(productLine).toContainText('session');
		await expect(productLine.locator('#quote-item-quantity-0')).toHaveValue('2.125');
		await expect(productLine.locator('#quote-item-price-0')).toHaveValue('111.11');
		await expect(productLine.locator('#quote-item-description-0')).toHaveValue(
			'Updated P24 customer description'
		);
		await expect(page.locator('[data-testid="quote-document-preview"]')).toBeVisible();
		for (const viewport of [
			{ width: 1280, height: 900 },
			{ width: 390, height: 844 }
		]) {
			await page.setViewportSize(viewport);
			const dimensions = await page.evaluate(() => ({
				viewport: window.innerWidth,
				document: document.documentElement.scrollWidth
			}));
			expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
		}

		const repriced = (await authenticatedRpc(
			'change_product_price',
			{
				p_product_id: firstProduct.id,
				p_lock_version: firstProduct.lockVersion,
				p_unit_price: '333.3333',
				p_reason: 'P24 stale source browser proof'
			},
			owner
		)) as { product_id: string; lock_version: number };
		firstProduct = { id: repriced.product_id, lockVersion: repriced.lock_version };
		await page.reload({ waitUntil: 'networkidle' });
		await expect(
			page.getByText('Product changed since this line was added', { exact: true })
		).toBeVisible();
		await page.getByRole('button', { name: 'Keep Quoted Values', exact: true }).click();
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByText('Product changed since this line was added', { exact: true })
		).toHaveCount(0);
		productLine = page.locator('.line-item').filter({ hasText: 'P24-BROWSER-01-UPDATED' });
		await expect(productLine.locator('#quote-item-price-0')).toHaveValue('111.11');
		await expect(productLine).toContainText('125.5');

		await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('button', { name: 'Send quote', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(1);
		await expect(
			page.getByRole('button', { name: 'Refresh from Catalogue', exact: true })
		).toHaveCount(0);
	} finally {
		await runCleanup([
			...leadIds.map((leadId) => ({
				label: 'Lead ' + leadId,
				run: () => cleanupLeadData(leadId)
			})),
			{
				label: 'Product fixtures',
				run: async () => cleanupProductFixtures(productIds, categoryIds)
			},
			{ label: 'auth user ' + owner.id, run: () => cleanupUser(owner.id) }
		]);
	}
});

test('catalogue-first new quotes add Products locally before saving', async ({ page }) => {
	test.setTimeout(120_000);
	const owner = await createStaff('owner', 'p24-catalogue-first');
	const leadIds: string[] = [];
	const productIds: string[] = [];
	const categoryIds: string[] = [];

	try {
		const category = (await authenticatedRpc(
			'create_product_category',
			{ p_code: 'p24-' + Date.now() + '-catalogue-first', p_label: 'P24 Catalogue First' },
			owner
		)) as { product_category_id: string };
		categoryIds.push(category.product_category_id);
		const product = await createActiveProduct(
			owner,
			'P24-CATALOGUE-FIRST',
			'P24 Catalogue First Product',
			category.product_category_id
		);
		productIds.push(product.id);

		const lead = await ingestLead('p24-catalogue-first');
		leadIds.push(lead.id);
		await moveLeadToDecision(lead.id, owner);

		await signIn(page, owner);
		await page.goto(`/quotes/new?lead_id=${lead.id}`, { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('heading', { name: 'Add from catalogue', exact: true })
		).toBeVisible();
		await expect(page.getByLabel('Search catalogue')).toBeVisible();
		await expect(page.locator('.line-item')).toHaveCount(0);
		await expect(page.getByText('Custom setup line', { exact: true })).toHaveCount(0);
		await expect
			.soft(page.getByLabel('Category').locator('option', { hasText: 'P24 Catalogue First' }))
			.toHaveCount(1);

		await page.getByLabel('Search catalogue').fill('P24-CATALOGUE-FIRST');
		const productOption = page
			.locator('.product-picker-option')
			.filter({ hasText: 'P24 Catalogue First Product' });
		await expect(productOption).toBeVisible();
		await productOption.getByRole('button', { name: 'Use Product', exact: true }).click();
		await page.getByRole('button', { name: 'Add Product to quote', exact: true }).click();

		await expect(page).toHaveURL(new RegExp(`/quotes/new\\?lead_id=${lead.id}$`));
		await expect(page.locator('.line-item')).toHaveCount(1);
		await expect(page.locator('#quote-item-name-0')).toHaveValue('P24 Catalogue First Product');

		await page.getByLabel('Subject').fill('P24 failed new quote');
		await page.getByLabel('Tax rate (%)').fill('15.1234567');
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: 'Quote could not be saved', exact: true })
		).toBeVisible();
		await expect(page.getByText('tax rate must be a valid decimal', { exact: true })).toBeVisible();
		await expect(page.locator('.line-item.catalogue-line')).toHaveCount(1);
		await expect(page.getByText('Catalogue line', { exact: true })).toBeVisible();
		await expect(page.locator('#quote-item-name-0')).toHaveValue('P24 Catalogue First Product');
		expect(await readQuotesForLead(lead.id, owner)).toHaveLength(0);
	} finally {
		await runCleanup([
			...leadIds.map((leadId) => ({
				label: 'Lead ' + leadId,
				run: () => cleanupLeadData(leadId)
			})),
			{
				label: 'Product fixtures',
				run: async () => cleanupProductFixtures(productIds, categoryIds)
			},
			{ label: 'auth user ' + owner.id, run: () => cleanupUser(owner.id) }
		]);
	}
});
