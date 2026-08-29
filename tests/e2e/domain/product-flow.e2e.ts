import { expect, test } from '@playwright/test';
import { cleanupLead, createStaff, gotoAndWaitForHeading, ingestLead, signIn } from './helpers';

test('keeps the primary product flow labelled and within the viewport', async ({ page }) => {
	const user = await createStaff('owner');
	const lead = await ingestLead('p2-02-product');
	try {
		await signIn(page, user);
		await page.setViewportSize({ width: 390, height: 844 });
		await gotoAndWaitForHeading(page, `/leads/${lead.id}`, 'P14 Browser Harness');
		await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'P14 Browser Harness' })).toBeVisible();
		const dimensions = await page.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth
		}));
		expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

		await gotoAndWaitForHeading(page, '/tasks', 'Follow-ups');
		const createForm = page.locator('form.create-form');
		const taskTable = page.locator('table.tasks-table');
		const taskRow = (title: string) => taskTable.locator('tbody tr').filter({ hasText: title });
		const namespace = `P2-02-${lead.id}`;
		const completeTitle = `${namespace} complete`;
		const cancelTitle = `${namespace} cancel`;
		const deterministicDueAt = '2000-01-01T00:00';

		await expect(createForm).toBeVisible();
		await createForm.getByLabel('Context type').selectOption('client');
		await expect(createForm.getByLabel('Customer')).toBeVisible();
		await createForm.getByLabel('Context type').selectOption('quote');
		await expect(createForm.getByLabel('Quote')).toBeVisible();

		for (const title of [completeTitle, cancelTitle]) {
			await createForm.getByLabel('Context type').selectOption('lead');
			await createForm.getByLabel('Enquiry').selectOption(lead.id);
			await createForm.getByLabel('What needs to happen?').fill(title);
			await createForm.getByLabel('Due date').fill(deterministicDueAt);
			await createForm.getByRole('button', { name: 'Add follow-up action', exact: true }).click();
			await gotoAndWaitForHeading(
				page,
				`/tasks?status=open&search=${encodeURIComponent(title)}`,
				'Follow-ups'
			);
			await expect(taskRow(title)).toHaveCount(1);
			await expect(taskRow(title)).toBeVisible();
		}

		await gotoAndWaitForHeading(
			page,
			`/tasks?status=open&search=${encodeURIComponent(completeTitle)}`,
			'Follow-ups'
		);
		const completeRow = taskRow(completeTitle);
		await completeRow.getByRole('button', { name: 'Complete', exact: true }).click();
		await gotoAndWaitForHeading(
			page,
			`/tasks?status=completed&search=${encodeURIComponent(completeTitle)}`,
			'Follow-ups'
		);
		await expect(taskRow(completeTitle)).toHaveCount(1);
		await expect(taskRow(completeTitle)).toBeVisible();

		await gotoAndWaitForHeading(
			page,
			`/tasks?status=open&search=${encodeURIComponent(cancelTitle)}`,
			'Follow-ups'
		);
		const cancelRow = taskRow(cancelTitle);
		await expect(cancelRow).toHaveCount(1);
		await expect(cancelRow).toBeVisible();
		await cancelRow.getByRole('button', { name: 'Cancel', exact: true }).click();
		await gotoAndWaitForHeading(
			page,
			`/tasks?status=cancelled&search=${encodeURIComponent(cancelTitle)}`,
			'Follow-ups'
		);
		await expect(taskRow(cancelTitle)).toHaveCount(1);
		await expect(taskRow(cancelTitle)).toBeVisible();
	} finally {
		await cleanupLead(lead.id, user.id);
	}
});
