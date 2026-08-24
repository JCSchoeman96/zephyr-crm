import { expect, test } from '@playwright/test';
import { cleanupLead, createStaff, ingestLead, lostReasonId, readLead, signIn } from './helpers';

test.describe('canonical Lost browser journey', () => {
	test('requires a reason and persists a terminal Lost Lead', async ({ page }) => {
		const user = await createStaff('owner');
		const lead = await ingestLead('lost');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
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
			expect(persisted?.lost_reason_id).toBe(reason);
			expect(persisted?.lost_notes).toContain('P14 browser Lost');
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
