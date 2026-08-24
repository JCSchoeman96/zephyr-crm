import { expect, test } from '@playwright/test';
import { cleanupLead, createStaff, ingestLead, signIn } from './helpers';

test('keeps the primary product flow labelled and within the viewport', async ({ page }) => {
	const user = await createStaff('owner');
	const lead = await ingestLead('product');
	try {
		await signIn(page, user);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
		await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'P14 Browser Harness' })).toBeVisible();
		const dimensions = await page.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth
		}));
		expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

		await page.goto('/tasks', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
		await expect(page.getByLabel('Context type')).toBeVisible();
		await page.getByLabel('Context type').selectOption('client');
		await expect(page.getByLabel('Client')).toBeVisible();
		await page.getByLabel('Context type').selectOption('quote');
		await expect(page.getByLabel('Quote')).toBeVisible();
	} finally {
		await cleanupLead(lead.id, user.id);
	}
});
