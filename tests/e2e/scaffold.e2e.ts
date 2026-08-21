import { expect, test } from '@playwright/test';

test('loads the blank Zephyr CRM scaffold', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Zephyr CRM' })).toBeVisible();
});
