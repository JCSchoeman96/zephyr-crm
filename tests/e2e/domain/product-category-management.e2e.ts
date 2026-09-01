import { execFileSync } from 'node:child_process';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { cleanupUser, createStaff, signIn, type StaffUser } from './helpers';

function parseLocalDatabaseUrl(value: string): string {
	const rawValue = value.trim().replace(/^"(.*)"$/, '$1');
	let url: URL;
	try {
		url = new URL(rawValue);
	} catch {
		throw new Error('Local Supabase DB_URL is not a valid URL.');
	}

	const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
	if (url.protocol !== 'postgresql:') {
		throw new Error('Local Supabase DB_URL must use the PostgreSQL protocol.');
	}
	if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
		throw new Error('Local Supabase DB_URL must point to localhost, 127.0.0.1, or ::1.');
	}
	return url.toString();
}

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for category cleanup.');
	return parseLocalDatabaseUrl(line.slice('DB_URL='.length));
}

const testCategoryCodePattern = /^p22-\d+-[a-z]+(?:-[a-z]+)*$/;

function validatedCategoryCode(code: string): string {
	if (!testCategoryCodePattern.test(code)) throw new Error('Invalid category cleanup code.');
	return code;
}

function cleanupCategoryFixture(categoryId: string, categoryCodes: readonly string[]): void {
	const codes = [...new Set(categoryCodes)].map(validatedCategoryCode);
	if (codes.length === 0) throw new Error('At least one category cleanup code is required.');
	const safeCategoryId = /^[0-9a-f-]{36}$/i.test(categoryId) ? categoryId : '';
	const codeVariables = codes.map((code, index) => ({
		name: `category_code_${index}`,
		value: code
	}));
	const categoryMatch = [
		safeCategoryId ? "id = :'category_id'::uuid" : '',
		`code in (${codeVariables.map(({ name }) => `:'${name}'`).join(', ')})`
	]
		.filter(Boolean)
		.join(' or ');
	const variableArguments = [
		...(safeCategoryId ? ['-v', `category_id=${safeCategoryId}`] : []),
		...codeVariables.flatMap(({ name, value }) => ['-v', `${name}=${value}`])
	];
	const cleanupSql =
		[
			'begin',
			'alter table public.activities disable trigger activities_append_only',
			`delete from public.activities where product_category_id in (select id from public.product_categories where ${categoryMatch})`,
			`delete from public.product_categories where ${categoryMatch}`,
			'alter table public.activities enable trigger activities_append_only',
			'commit'
		].join(';') + ';\n';
	execFileSync(
		'psql',
		[localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', ...variableArguments, '-f', '-'],
		{ encoding: 'utf8', input: cleanupSql, stdio: ['pipe', 'pipe', 'pipe'] }
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

test('category cleanup rejects unsafe database URLs', () => {
	expect(() => parseLocalDatabaseUrl('not-a-url')).toThrow(
		'Local Supabase DB_URL is not a valid URL.'
	);
	expect(() => parseLocalDatabaseUrl('https://localhost:54332/postgres')).toThrow(
		'Local Supabase DB_URL must use the PostgreSQL protocol.'
	);
	expect(() => parseLocalDatabaseUrl('postgresql://db.example:54332/postgres')).toThrow(
		'Local Supabase DB_URL must point to localhost, 127.0.0.1, or ::1.'
	);
	expect(() => parseLocalDatabaseUrl('postgresql://[::1]:54332/postgres')).not.toThrow();
});

test('Owner can manage flat Product categories while Sales cannot access the manager', async ({
	page
}) => {
	let owner: StaffUser | null = null;
	let sales: StaffUser | null = null;
	const categoryCode = `p22-${Date.now()}-screens`;
	const editedCategoryCode = `${categoryCode}-edited`;
	const categoryLabel = 'P22 Screens';
	const editedCategoryLabel = 'P22 Edited Screens';
	let categoryId = '';

	try {
		owner = await createStaff('owner', 'p22-category-owner');
		sales = await createStaff('sales', 'p22-category-sales');
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
		categoryId = await categoryRow.locator('input[name="category_id"]').first().inputValue();
		await expect(categoryRow.getByLabel('Category label')).toHaveValue(categoryLabel);

		const duplicateForm = page.locator('form.category-create-form');
		await duplicateForm.getByLabel('Category code').fill(categoryCode);
		await duplicateForm.getByLabel('Category label').fill('Duplicate Screens');
		await duplicateForm.getByLabel('Sort order').fill('41');
		const duplicateResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/products/categories'
		);
		await duplicateForm.getByRole('button', { name: 'Create category', exact: true }).click();
		const duplicateResponse = await duplicateResponsePromise;
		expect(duplicateResponse.status()).toBe(422);
		await expect(page.getByRole('alert')).toContainText('unique code');
		await expect(duplicateForm.getByLabel('Category code')).toHaveValue(categoryCode);
		await expect(duplicateForm.getByLabel('Category label')).toHaveValue('Duplicate Screens');
		await expect(duplicateForm.getByLabel('Sort order')).toHaveValue('41');

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
		try {
			cleanupCategoryFixture(categoryId, [categoryCode, editedCategoryCode]);
		} finally {
			try {
				if (owner) await cleanupUser(owner.id);
			} finally {
				if (sales) await cleanupUser(sales.id);
			}
		}
	}
});

test('category validation returns a 422 response for an oversized sort order', async ({ page }) => {
	let owner: StaffUser | null = null;

	try {
		owner = await createStaff('owner', 'p22-category-validation');
		await signIn(page, owner);
		await page.goto('/products/categories', { waitUntil: 'networkidle' });
		const createForm = page.locator('form.category-create-form');
		await createForm.evaluate((form) => {
			(form as HTMLFormElement).noValidate = true;
		});
		const validationCode = `p22-${Date.now()}-validation`;
		await createForm.getByLabel('Category code').fill(validationCode);
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
		await expect(createForm.getByLabel('Category code')).toHaveValue(validationCode);
		await expect(createForm.getByLabel('Category label')).toHaveValue('P22 Validation');
		await expect(createForm.getByLabel('Sort order')).toHaveValue('9007199254740992');
	} finally {
		if (owner) await cleanupUser(owner.id);
	}
});

test('category edit failures preserve submitted values', async ({ page }) => {
	let owner: StaffUser | null = null;
	const categoryCode = `p22-${Date.now()}-preserve`;
	const editedCode = `${categoryCode}-edited`;
	let categoryId = '';

	try {
		owner = await createStaff('owner', 'p22-category-preserve');
		await signIn(page, owner);
		await page.goto('/products/categories', { waitUntil: 'networkidle' });
		const createForm = page.locator('form.category-create-form');
		await createForm.getByLabel('Category code').fill(categoryCode);
		await createForm.getByLabel('Category label').fill('P22 Preserve');
		await createForm.getByLabel('Sort order').fill('10');
		await createForm.getByRole('button', { name: 'Create category', exact: true }).click();
		await page.waitForURL('/products/categories');

		let categoryRow = await categoryRowForCode(page, categoryCode);
		categoryId = await categoryRow.locator('input[name="category_id"]').first().inputValue();
		const editForm = categoryRow.locator('form.category-edit-form');
		await editForm.evaluate((form) => {
			(form as HTMLFormElement).noValidate = true;
		});
		await editForm.getByLabel('Category code').fill(editedCode);
		await editForm.getByLabel('Category label').fill('');
		await editForm.getByLabel('Sort order').fill('25');
		const updateResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/products/categories'
		);
		await editForm.getByRole('button', { name: 'Save category', exact: true }).click();
		const updateResponse = await updateResponsePromise;
		expect(updateResponse.status()).toBe(422);

		categoryRow = await categoryRowForCode(page, editedCode);
		await expect(categoryRow.getByLabel('Category code')).toHaveValue(editedCode);
		await expect(categoryRow.getByLabel('Category label')).toHaveValue('');
		await expect(categoryRow.getByLabel('Sort order')).toHaveValue('25');

		const statusForm = categoryRow.locator('form.category-status-form');
		await statusForm.locator('input[name="lock_version"]').evaluate((input) => {
			(input as HTMLInputElement).value = '999';
		});
		await statusForm.getByLabel('Inactivation reason').fill('Preserve this conflict reason');
		const conflictResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/products/categories'
		);
		await statusForm.getByRole('button', { name: 'Inactivate category', exact: true }).click();
		const conflictResponse = await conflictResponsePromise;
		expect(conflictResponse.status()).toBe(409);
		categoryRow = await categoryRowForCode(page, categoryCode);
		await expect(categoryRow.getByLabel('Inactivation reason')).toHaveValue(
			'Preserve this conflict reason'
		);
	} finally {
		try {
			cleanupCategoryFixture(categoryId, [categoryCode, editedCode]);
		} finally {
			if (owner) await cleanupUser(owner.id);
		}
	}
});
