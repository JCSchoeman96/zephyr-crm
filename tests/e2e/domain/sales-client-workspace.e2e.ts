import { expect, test } from '@playwright/test';
import { cleanupLead, createStaff, ingestLead, signIn } from './helpers';

test.describe('Sales client workspace', () => {
	test('keeps client context visible while switching tabs and completing a follow-up', async ({
		page
	}) => {
		test.setTimeout(120_000);
		const user = await createStaff('owner', 'sales-client-workspace');
		const lead = await ingestLead('workspace');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await expect(
				page.getByRole('heading', { name: 'P14 Browser Harness', exact: true })
			).toBeVisible();
			await expect(page.getByText('Next step', { exact: true })).toBeVisible();
			await expect(page.getByText('Review the enquiry', { exact: true })).toBeVisible();
			await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
				'aria-current',
				'page'
			);

			const detailNavigation = page.getByRole('navigation', { name: 'Enquiry detail sections' });
			await detailNavigation.getByRole('link', { name: 'Quotes', exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/leads/${lead.id}\\?tab=quotes$`));
			await expect(page.getByText('No quote yet', { exact: true })).toBeVisible();
			await expect(page.getByRole('link', { name: 'Create quote', exact: true })).toBeVisible();

			await detailNavigation.getByRole('link', { name: /Follow-up actions/ }).click();
			await expect(page).toHaveURL(new RegExp(`/leads/${lead.id}\\?tab=follow-ups$`));
			await page.getByLabel('What needs to happen?').fill('Call the customer about timing');
			await page.getByRole('button', { name: 'Add follow-up', exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/leads/${lead.id}\\?tab=follow-ups$`));
			await expect(page.getByText('Call the customer about timing', { exact: true })).toBeVisible();

			await page.getByRole('button', { name: 'Complete', exact: true }).click();
			await expect(
				page.getByText('Completed and cancelled actions (1)', { exact: true })
			).toBeVisible();

			await detailNavigation.getByRole('link', { name: 'History', exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/leads/${lead.id}\\?tab=history$`));
			await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
			await expect(page.getByText('Follow-up action added', { exact: true })).toBeVisible();

			await page.setViewportSize({ width: 390, height: 844 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
