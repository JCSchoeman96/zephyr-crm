import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { authenticatedRpc, cleanupUser, createStaff, signIn } from './helpers';

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for Product cleanup.');
	return line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
}

function cleanupProductFixtures(productIds: string[], categoryIds: string[]): void {
	const ids = [...productIds, ...categoryIds];
	if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
		throw new Error('Invalid Product cleanup ID.');
	const products = productIds.map((id) => `'${id}'::uuid`).join(',');
	const categories = categoryIds.map((id) => `'${id}'::uuid`).join(',');
	const statements = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		products ? `delete from public.activities where product_id in (${products})` : '',
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

function productIdFromUrl(url: string): string {
	const match = new URL(url).pathname.match(/^\/products\/([0-9a-f-]{36})$/i);
	if (!match) throw new Error(`Product detail URL was not reached: ${url}`);
	return match[1];
}

test('Owner can manage Products while Sales can read without catalogue mutation controls', async ({
	page
}) => {
	const owner = await createStaff('owner', 'p22-products-owner');
	const sales = await createStaff('sales', 'p22-products-sales');
	const productIds: string[] = [];
	const categoryIds: string[] = [];

	try {
		await signIn(page, owner);
		const listResponse = await page.goto('/products', { waitUntil: 'networkidle' });
		expect(listResponse?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();

		const category = (await authenticatedRpc(
			'create_product_category',
			{ p_code: `p22-${Date.now()}-screens`, p_label: 'Screens' },
			owner
		)) as { product_category_id: string };
		categoryIds.push(category.product_category_id);

		await page.goto('/products/new', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'New Product', exact: true })).toBeVisible();
		const draftForm = page.locator('form.product-form');
		await draftForm.getByLabel('Product code').fill(`P22-DRAFT-${Date.now()}`);
		await draftForm.getByLabel('Product name').fill('Draft Screen');
		await draftForm.getByLabel('Kind').selectOption('product');
		await draftForm.getByLabel('Category').selectOption(category.product_category_id);
		await draftForm.getByLabel('Unit label').fill('each');
		await draftForm.getByLabel('Currency').fill('ZAR');
		await draftForm.getByLabel('Unit price').fill('125.5000');
		await draftForm.getByLabel('Customer description').fill('A draft customer description');
		await draftForm.getByLabel('Internal notes').fill('A private maintenance note');
		await draftForm.getByRole('button', { name: 'Save draft', exact: true }).click();
		await page.waitForURL(/\/products\/[0-9a-f-]{36}$/i);
		productIds.push(productIdFromUrl(page.url()));
		await expect(page.getByText('Draft', { exact: true })).toBeVisible();

		await page.goto(
			`/products?q=Draft%20Screen&status=draft&kind=product&category_id=${category.product_category_id}`,
			{ waitUntil: 'networkidle' }
		);
		const draftRow = page
			.locator('table.products-table tbody tr')
			.filter({ hasText: 'Draft Screen' });
		await expect(draftRow).toHaveCount(1);
		await expect(draftRow).toContainText('Draft');

		await page.goto('/products/new', { waitUntil: 'networkidle' });
		const activeForm = page.locator('form.product-form');
		await activeForm.getByLabel('Product code').fill(`P22-ACTIVE-${Date.now()}`);
		await activeForm.getByLabel('Product name').fill('Hourly Consultation');
		await activeForm.getByLabel('Kind').selectOption('service');
		await activeForm.getByLabel('Category').selectOption(category.product_category_id);
		await activeForm.getByLabel('Unit label').fill('hour');
		await activeForm.getByLabel('Currency').fill('ZAR');
		await activeForm.getByLabel('Unit price').fill('900.0000');
		await activeForm.getByLabel('Customer description').fill('Consultation service');
		await activeForm.getByLabel('Internal notes').fill('Do not show to customers');
		await activeForm.getByRole('button', { name: 'Save & activate', exact: true }).click();
		await page.waitForURL(/\/products\/[0-9a-f-]{36}$/i);
		const activeProductId = productIdFromUrl(page.url());
		productIds.push(activeProductId);
		await expect(page.getByText('Active', { exact: true })).toBeVisible();

		await page.goto(
			`/products?q=Hourly%20Consultation&status=active&kind=service&category_id=${category.product_category_id}`,
			{ waitUntil: 'networkidle' }
		);
		const activeRow = page
			.locator('table.products-table tbody tr')
			.filter({ hasText: 'Hourly Consultation' });
		await expect(activeRow).toHaveCount(1);
		await expect(activeRow).toContainText('Service');

		await page.goto(`/products/${activeProductId}`, { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Inactivate product', exact: true }).click();
		await expect(page.getByText('Inactive', { exact: true })).toBeVisible();

		await page.goto(`/products?status=inactive&q=Hourly%20Consultation`, {
			waitUntil: 'networkidle'
		});
		await expect(
			page.locator('table.products-table tbody tr').filter({ hasText: 'Hourly Consultation' })
		).toHaveCount(1);

		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toMatch(/\b(stock|inventory|warehouse|supplier|barcode)\b/i);
		await page.setViewportSize({ width: 390, height: 844 });
		const dimensions = await page.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth
		}));
		expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

		await signIn(page, sales);
		const salesListResponse = await page.goto('/products', { waitUntil: 'networkidle' });
		expect(salesListResponse?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New Product', exact: true })).toHaveCount(0);
		const salesNewResponse = await page.goto('/products/new', { waitUntil: 'networkidle' });
		expect(salesNewResponse?.status()).toBe(403);
	} finally {
		cleanupProductFixtures(productIds, categoryIds);
		await cleanupUser(owner.id);
		await cleanupUser(sales.id);
	}
});
