import { expect, test } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

test('preserves an invalid submitted dimension payload until the editor changes it', async ({
	page
}) => {
	const owner = await createStaff('owner', 'product-dimensions-form');
	const invalidDefinitions = '[{"key":"width","label":';

	try {
		await signIn(page, owner);
		await page.goto('/products/new', { waitUntil: 'networkidle' });

		const form = page.locator('form.product-form');
		await form.getByLabel('Product code').fill(`P14-DIMENSIONS-${Date.now()}`);
		await form.getByLabel('Product name').fill('Dimension validation fixture');
		await form.getByLabel('Kind').selectOption('product');
		await form.getByLabel('Unit label').fill('each');
		await form.getByLabel('Currency').fill('ZAR');
		await form.getByLabel('Unit price').fill('125.5000');
		await form.getByLabel('This Product requires measurements').check();
		await form.locator('input[name="dimension_definitions"]').evaluate((input, value) => {
			(input as HTMLInputElement).value = value as string;
		}, invalidDefinitions);

		await form.getByRole('button', { name: 'Save draft', exact: true }).click();
		await expect(
			page.getByRole('heading', { name: 'Product action failed', exact: true })
		).toBeVisible();

		const dimensionsField = form.locator('input[name="dimension_definitions"]');
		await expect(dimensionsField).toHaveValue(invalidDefinitions);
		await expect(form.getByText('Add at least one measurement before saving.')).toBeVisible();

		await form.getByRole('button', { name: 'Add measurement', exact: true }).click();
		await expect(dimensionsField).toHaveValue(
			JSON.stringify([{ key: 'width', label: 'Width', unit: 'mm', required: true }])
		);
		await expect(form.getByLabel('Customer-facing label')).toHaveValue('Width');
	} finally {
		await cleanupUser(owner.id);
	}
});
