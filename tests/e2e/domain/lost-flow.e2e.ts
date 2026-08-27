import { expect, test, type Page } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLead,
	cleanupUser,
	createStaff,
	gotoAndWaitForHeading,
	ingestLead,
	lostReasonByCode,
	lostReasonId,
	readLead,
	readLeadActivities,
	reloadAndWaitForHeading,
	runCleanup,
	signIn,
	signInWithAal2
} from './helpers';

async function openLostForm(page: Page) {
	const panel = page.locator('details.lost-panel');
	const form = panel.locator('form[action="?/lost"]');
	await expect(panel).toBeVisible();
	if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
		await panel.locator('summary').click();
	}
	await expect(form).toBeVisible();
	return form;
}

test.describe('canonical Lost browser journey', () => {
	test('requires loss/reopen evidence and rejects stale or unauthorized actions', async ({
		page,
		browser
	}) => {
		const user = await createStaff('owner');
		const sales = await createStaff('sales', 'lost-sales');
		const lead = await ingestLead('lost');
		let salesContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
		try {
			await signIn(page, user);
			await gotoAndWaitForHeading(page, `/leads/${lead.id}`, 'P14 Browser Lost');
			const initialLossForm = await openLostForm(page);
			await initialLossForm.getByRole('button', { name: 'Close enquiry', exact: true }).click();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('NEW');

			const otherReason = await lostReasonByCode('other', user);
			const otherLossForm = await openLostForm(page);
			await otherLossForm.getByLabel('Why is it not proceeding?').selectOption(otherReason);
			await otherLossForm.getByRole('button', { name: 'Close enquiry', exact: true }).click();
			await expect(page.getByRole('alert')).toContainText(/action could not be completed/i);
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('NEW');

			const validLossForm = await openLostForm(page);
			const reason = await lostReasonId(user);
			await validLossForm.getByLabel('Why is it not proceeding?').selectOption(reason);
			await validLossForm
				.getByLabel('Extra notes (optional)')
				.fill('P14 browser Lost acceptance path');
			await validLossForm.getByRole('button', { name: 'Close enquiry', exact: true }).click();
			await expect(page.getByText('Not proceeding', { exact: true })).toBeVisible();
			await expect(page.getByText('This enquiry is marked as not proceeding.')).toBeVisible();
			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('LOST');
			const persisted = await readLead(lead.id, user);
			if (!persisted) throw new Error('Lost flow did not persist the Lead.');
			expect(persisted?.lost_reason_id).toBe(reason);
			expect(persisted?.lost_notes).toContain('P14 browser Lost');
			await signInWithAal2(page, user);
			await gotoAndWaitForHeading(page, `/leads/${lead.id}`, 'P14 Browser Lost');

			salesContext = await browser.newContext();
			const salesPage = await salesContext.newPage();
			await signIn(salesPage, sales);
			await gotoAndWaitForHeading(salesPage, `/leads/${lead.id}`, 'P14 Browser Lost');
			await expect(salesPage.locator('form[action="?/reopen"]')).toHaveCount(0);

			const ownerReopenForm = page.locator('form[action="?/reopen"]');
			await expect(ownerReopenForm).toBeVisible();
			await ownerReopenForm.getByRole('button', { name: 'Reopen enquiry', exact: true }).click();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('LOST');

			const freshOwnerPage = await page.context().newPage();
			await gotoAndWaitForHeading(freshOwnerPage, `/leads/${lead.id}`, 'P14 Browser Lost');
			await authenticatedRpc(
				'set_lead_attention',
				{
					p_lead_id: lead.id,
					p_attention_state: 'none',
					p_lock_version: persisted.lock_version
				},
				user
			);
			const freshReopenForm = freshOwnerPage.locator('form[action="?/reopen"]');
			await expect(freshReopenForm).toBeVisible();
			await freshReopenForm
				.getByLabel('Why are you reopening it?')
				.fill('P14 owner administrative review');
			await freshReopenForm.getByRole('button', { name: 'Reopen enquiry', exact: true }).click();
			await expect(freshOwnerPage.getByRole('alert')).toContainText(/reload|conflict|stale/i);
			await reloadAndWaitForHeading(freshOwnerPage, 'P14 Browser Lost');
			await freshReopenForm
				.getByLabel('Why are you reopening it?')
				.fill('P14 owner administrative review');
			await freshReopenForm.getByRole('button', { name: 'Reopen enquiry', exact: true }).click();
			await expect(freshOwnerPage.getByText('Reviewing details', { exact: true })).toBeVisible();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('QUALIFICATION');

			const activities = await readLeadActivities(lead.id, user);
			expect(activities.some((activity) => activity.event_type === 'lead_lost')).toBe(true);
			expect(activities.some((activity) => activity.event_type === 'lead_reopened')).toBe(true);
		} finally {
			const context = salesContext;
			await runCleanup([
				...(context ? [{ label: 'sales browser context', run: () => context.close() }] : []),
				{ label: `Lost lead ${lead.id}`, run: () => cleanupLead(lead.id, user.id) },
				{ label: `sales user ${sales.id}`, run: () => cleanupUser(sales.id) }
			]);
		}
	});
});
