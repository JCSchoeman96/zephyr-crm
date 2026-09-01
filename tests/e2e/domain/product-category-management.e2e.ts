import { execFileSync } from 'node:child_process';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for category cleanup.');
	return line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
}

function cleanupCategoryFixture(categoryId: string): void {
	if (!/^[0-9a-f-]{36}$/i.test(categoryId)) throw new Error('Invalid category cleanup ID.');
	execFileSync(
		'psql',
		[
			localDatabaseUrl(),
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-c',
			[
				'begin',
				'alter table public.activities disable trigger activities_append_only',
				`delete from public.activities where product_category_id = '${categoryId}'::uuid`,
				`delete from public.product_categories where id = '${categoryId}'::uuid`,
				'alter table public.activities enable trigger activities_append_only',
				'commit'
			].join(';') + ';'
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
}

async function categoryRowForCode(page: Page, code: string): Promise<Locator> {
	const rows = page.locator('tr.category-row');
	const index = await rows.evaluateAll((elements, expectedCode) => {
		return elements.findIndex(
			(element) =>
				element.querySelector<HTMLInputElement>('input[name="code"]')?.value === expectedCode
		);
	}, code);
	expect(index).toBeGreaterThanOrEqual(0);
	return rows.nth(index);
}

test('Owner can manage flat Product categories while Sales cannot access the manager', async ({
	page
}) => {
	const owner = await createStaff('owner', 'p22-category-owner');
	const sales = await createStaff('sales', 'p22-category-sales');
	const categoryCode = `p22-${Date.now()}-screens`;
	const editedCategoryCode = `${categoryCode}-edited`;
	const categoryLabel = 'P22 Screens';
	const editedCategoryLabel = 'P22 Edited Screens';
	let categoryId = '';

	try {
		await signIn(page, owner);
		await page.goto('/products', { waitUntil: 'networkidle' });
		await expect(page.getByRole('link', { name: 'Manage categories', exact: true })).toBeVisible();
		await page.getByRole('link', { name: 'Manage categories', exact: true }).click();
		await page.waitForURL('/products/categories');
		await expect(
			page.getByRole('heading', { name: 'Product categories', exact: true })
		).toBeVisible();

		const createForm = page.locator('form.category-create-form');
		await createForm.getByLabel('Category code').fill(categoryCode);
		await createForm.getByLabel('Category label').fill(categoryLabel);
		await createForm.getByLabel('Sort order').fill('40');
		await createForm.getByRole('button', { name: 'Create category', exact: true }).click();
		await page.waitForURL('/products/categories');

		let categoryRow = await categoryRowForCode(page, categoryCode);
		await expect(categoryRow.getByLabel('Category label')).toHaveValue(categoryLabel);
		categoryId = await categoryRow.locator('input[name="category_id"]').first().inputValue();

		await categoryRow.getByLabel('Category code').fill(editedCategoryCode);
		await categoryRow.getByLabel('Category label').fill(editedCategoryLabel);
		await categoryRow.getByLabel('Sort order').fill('25');
		await categoryRow.getByRole('button', { name: 'Save category', exact: true }).click();
		await page.waitForURL('/products/categories');

		categoryRow = await categoryRowForCode(page, editedCategoryCode);
		await expect(categoryRow.getByLabel('Category label')).toHaveValue(editedCategoryLabel);
		await page.reload({ waitUntil: 'networkidle' });
		categoryRow = await categoryRowForCode(page, editedCategoryCode);
		await expect(categoryRow.getByLabel('Sort order')).toHaveValue('25');
		await categoryRow.getByLabel('Inactivation reason').fill('Temporarily unavailable');
		await categoryRow.getByRole('button', { name: 'Inactivate category', exact: true }).click();
		await page.waitForURL('/products/categories');
		categoryRow = await categoryRowForCode(page, editedCategoryCode);
		await expect(categoryRow.getByText('inactive', { exact: true })).toBeVisible();

		await categoryRow.getByRole('button', { name: 'Activate category', exact: true }).click();
		await page.waitForURL('/products/categories');
		categoryRow = await categoryRowForCode(page, editedCategoryCode);
		await expect(categoryRow.getByText('active', { exact: true })).toBeVisible();

		await page.goto('/products/new', { waitUntil: 'networkidle' });
		const categoryOption = page.getByLabel('Category').locator(`option[value="${categoryId}"]`);
		await expect(categoryOption).toHaveText(`${editedCategoryLabel} (${editedCategoryCode})`);

		await signIn(page, sales);
		await page.goto('/products', { waitUntil: 'networkidle' });
		await expect(page.getByRole('link', { name: 'Manage categories', exact: true })).toHaveCount(0);
		const managementResponse = await page.goto('/products/categories', {
			waitUntil: 'networkidle'
		});
		expect(managementResponse?.status()).toBe(403);
	} finally {
		if (categoryId) {
			cleanupCategoryFixture(categoryId);
		}
		await cleanupUser(owner.id);
		await cleanupUser(sales.id);
	}
});

test('category validation returns a 422 response for an oversized sort order', async ({ page }) => {
	const owner = await createStaff('owner', 'p22-category-validation');

	try {
		await signIn(page, owner);
		await page.goto('/products/categories', { waitUntil: 'networkidle' });
		const createForm = page.locator('form.category-create-form');
		await createForm.evaluate((form) => {
			(form as HTMLFormElement).noValidate = true;
		});
		await createForm.getByLabel('Category code').fill(`p22-${Date.now()}-validation`);
		await createForm.getByLabel('Category label').fill('P22 Validation');
		await createForm.getByLabel('Sort order').fill('9007199254740992');

		const responsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/products/categories'
		);
		await createForm.getByRole('button', { name: 'Create category', exact: true }).click();
		const response = await responsePromise;
		expect(response.status()).toBe(422);
		await expect(page.getByRole('alert')).toContainText('Category sort order is too large');
	} finally {
		await cleanupUser(owner.id);
	}
});
