import { expect, test } from '@playwright/test';
import { cleanupLead, createStaff, ingestLead, readLead, signIn } from './helpers';

test.describe('stateful local browser harness', () => {
	test('uses real invitation auth, Bricks intake and persisted Lead state', async ({ page }) => {
		const user = await createStaff('owner');
		const lead = await ingestLead('harness');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'P14 Browser Harness' })).toBeVisible();
			await expect(page.getByText('New enquiry', { exact: true })).toBeVisible();
			await page.getByRole('button', { name: 'Start Qualification' }).click();
			await expect(page.getByRole('button', { name: 'Ready for Quote' })).toBeVisible();
			await expect
				.poll(async () => (await readLead(lead.id, user))?.pipeline_stage)
				.toBe('QUALIFICATION');
			await page.reload({ waitUntil: 'networkidle' });
			await expect(page.getByText('Reviewing details', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Ready for Quote' })).toBeVisible();
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
