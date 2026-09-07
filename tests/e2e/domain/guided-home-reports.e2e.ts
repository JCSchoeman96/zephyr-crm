import { expect, test } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

for (const role of ['owner', 'admin', 'sales', 'viewer'] as const) {
	test(`${role} can use operational Home and separate Reports`, async ({ page }) => {
		const user = await createStaff(role, 'guided-home');
		try {
			await signIn(page, user);
			await page.goto('/');
			await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
			await expect(
				page.getByRole('heading', { name: 'What needs attention', exact: true })
			).toBeVisible();
			await expect(
				page.getByRole('heading', { name: 'Sales and Fulfilment metrics', exact: true })
			).toHaveCount(0);
			for (const viewport of [
				{ width: 1440, height: 900 },
				{ width: 1024, height: 768 },
				{ width: 390, height: 844 }
			]) {
				await page.setViewportSize(viewport);
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
					true
				);
			}
			await page.goto('/reports');
			await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
			await expect(page.getByRole('form', { name: 'Reports date range' })).toBeVisible();
		} finally {
			await cleanupUser(user.id);
		}
	});
}
