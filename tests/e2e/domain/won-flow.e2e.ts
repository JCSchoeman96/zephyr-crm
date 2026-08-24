import { expect, test } from '@playwright/test';
import {
	cleanupLead,
	createStaff,
	ingestLead,
	readClientForLead,
	readLead,
	readQuotesForLead,
	signIn
} from './helpers';

test.describe('canonical Won browser journey', () => {
	test('creates a Quote, sends it through the fake provider, and converts the Lead', async ({
		page
	}) => {
		const user = await createStaff('owner');
		const lead = await ingestLead('won');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await page.getByRole('button', { name: 'Qualify lead' }).click();
			await page.getByRole('button', { name: 'Move to proposal' }).click();
			await expect(page.getByRole('heading', { name: 'Create a simple quote' })).toBeVisible();
			await page.locator('input[name="subject"]').fill('P14 browser Won quote');
			await page.locator('input[name="item_name"]').fill('P14 implementation');
			await page.locator('input[name="quantity"]').fill('2');
			await page.locator('input[name="unit_price"]').fill('1250');
			await page.locator('input[name="tax_rate"]').fill('15');
			await page.getByRole('button', { name: 'Create quote' }).click();
			await expect(page.getByRole('button', { name: 'Send quote' })).toBeVisible();
			await page.getByRole('button', { name: 'Send quote' }).click();
			await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Mark won and create Client' })).toBeVisible();
			await page.getByRole('button', { name: 'Mark won and create Client' }).click();
			await expect(page.getByText(/Converted to Client/)).toBeVisible();
			await expect(page.getByText('WON', { exact: true })).toBeVisible();

			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('WON');
			const client = await readClientForLead(lead.id, user);
			expect(client?.status).toBe('active');
			expect(client?.source_lead_id).toBe(lead.id);
			const quotes = await readQuotesForLead(lead.id, user);
			expect(quotes[0]?.status).toBe('sent');
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
