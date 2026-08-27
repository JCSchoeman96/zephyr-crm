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
		await expect(page.getByRole('heading', { name: 'Follow-ups', exact: true })).toBeVisible();
		await expect(page.getByLabel('Context type')).toBeVisible();
		await page.getByLabel('Context type').selectOption('client');
		await expect(page.getByLabel('Customer')).toBeVisible();
		await page.getByLabel('Context type').selectOption('quote');
		await expect(page.getByLabel('Quote')).toBeVisible();
		await page.getByLabel('Context type').selectOption('lead');
		await page.getByLabel('Enquiry').selectOption(lead.id);
		const completeTitle = `P14 complete task ${lead.id}`;
		const cancelTitle = `P14 cancel task ${lead.id}`;
		await page.getByLabel('What needs to happen?').fill(completeTitle);
		await page.getByRole('button', { name: 'Add follow-up action' }).click();
		await expect(page.getByText(completeTitle, { exact: true })).toBeVisible();
		await page.getByLabel('Enquiry').selectOption(lead.id);
		await page.getByLabel('What needs to happen?').fill(cancelTitle);
		await page.getByRole('button', { name: 'Add follow-up action' }).click();
		await expect(page.getByText(cancelTitle, { exact: true })).toBeVisible();
		const completeRow = page.getByRole('row').filter({ hasText: completeTitle });
		await completeRow.getByRole('button', { name: 'Complete' }).click();
		await page.getByLabel('Action status').selectOption('completed');
		await page.getByRole('button', { name: 'Apply filters' }).click();
		await expect(page.getByText(completeTitle, { exact: true })).toBeVisible();
		await page.getByLabel('Action status').selectOption('open');
		await page.getByRole('button', { name: 'Apply filters' }).click();
		await expect(page.getByText(cancelTitle, { exact: true })).toBeVisible();
		const cancelRow = page.getByRole('row').filter({ hasText: cancelTitle });
		await cancelRow.getByRole('button', { name: 'Cancel' }).click();
		await page.getByLabel('Action status').selectOption('cancelled');
		await page.getByRole('button', { name: 'Apply filters' }).click();
		await expect(page.getByText(cancelTitle, { exact: true })).toBeVisible();
	} finally {
		await cleanupLead(lead.id, user.id);
	}
});
