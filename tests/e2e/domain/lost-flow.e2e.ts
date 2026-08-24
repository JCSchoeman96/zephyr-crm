import { expect, test } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLead,
	cleanupUser,
	createStaff,
	ingestLead,
	lostReasonByCode,
	lostReasonId,
	readLead,
	readLeadActivities,
	signIn,
	signInWithAal2
} from './helpers';

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
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await page.getByText('Mark lead lost', { exact: true }).click();
			await page.getByRole('button', { name: 'Mark lost' }).click();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('NEW');

			const otherReason = await lostReasonByCode('other', user);
			await page.getByLabel('Lost reason').selectOption(otherReason);
			await page.getByRole('button', { name: 'Mark lost' }).click();
			await expect(page.getByRole('alert')).toContainText(/other lost reason requires/i);
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('NEW');

			await page.getByText('Mark lead lost', { exact: true }).click();
			const reason = await lostReasonId(user);
			await page.getByLabel('Lost reason').selectOption(reason);
			await page.getByLabel('Notes').fill('P14 browser Lost acceptance path');
			await page.getByRole('button', { name: 'Mark lost' }).click();
			await expect(page.getByText('LOST', { exact: true })).toBeVisible();
			await expect(
				page.getByText('This lead is terminal under ordinary operations.')
			).toBeVisible();
			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('LOST');
			const persisted = await readLead(lead.id, user);
			if (!persisted) throw new Error('Lost flow did not persist the Lead.');
			expect(persisted?.lost_reason_id).toBe(reason);
			expect(persisted?.lost_notes).toContain('P14 browser Lost');
			await signInWithAal2(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });

			salesContext = await browser.newContext();
			const salesPage = await salesContext.newPage();
			await signIn(salesPage, sales);
			await salesPage.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await expect(salesPage.getByRole('button', { name: 'Reopen for qualification' })).toHaveCount(
				0
			);

			await page.getByRole('button', { name: 'Reopen for qualification' }).click();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('LOST');

			const freshOwnerPage = await page.context().newPage();
			await freshOwnerPage.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await authenticatedRpc(
				'set_lead_attention',
				{
					p_lead_id: lead.id,
					p_attention_state: 'none',
					p_lock_version: persisted.lock_version
				},
				user
			);
			await freshOwnerPage.getByLabel('Reopen reason').fill('P14 owner administrative review');
			await freshOwnerPage.getByRole('button', { name: 'Reopen for qualification' }).click();
			await expect(freshOwnerPage.getByRole('alert')).toContainText(/reload|conflict|stale/i);
			await freshOwnerPage.reload({ waitUntil: 'networkidle' });
			await freshOwnerPage.getByLabel('Reopen reason').fill('P14 owner administrative review');
			await freshOwnerPage.getByRole('button', { name: 'Reopen for qualification' }).click();
			await expect(freshOwnerPage.getByText('QUALIFICATION', { exact: true })).toBeVisible();
			expect((await readLead(lead.id, user))?.pipeline_stage).toBe('QUALIFICATION');

			const activities = await readLeadActivities(lead.id, user);
			expect(activities.some((activity) => activity.event_type === 'lead_lost')).toBe(true);
			expect(activities.some((activity) => activity.event_type === 'lead_reopened')).toBe(true);
		} finally {
			await salesContext?.close();
			await cleanupLead(lead.id, user.id);
			await cleanupUser(sales.id);
		}
	});
});
