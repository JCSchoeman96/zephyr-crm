import { expect, test } from '@playwright/test';
import {
	cleanupLead,
	createStaff,
	ingestLead,
	readClientContacts,
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
			await page.getByRole('link', { name: 'P14 browser Won quote' }).click();
			await page.getByRole('button', { name: 'Add line item' }).click();
			await page.locator('#quote-item-name-1').fill('P14 support');
			await page.locator('#quote-item-quantity-1').fill('1');
			await page.locator('#quote-item-price-1').fill('500');
			await page.getByRole('button', { name: 'Save draft' }).click();
			await page.getByRole('button', { name: 'Mark ready' }).click();
			await expect(page.getByRole('button', { name: 'Send quote' })).toBeVisible();
			await page.getByRole('button', { name: 'Send quote' }).click();
			await expect(page.getByText('submitted', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
			const documentLink = page.getByRole('link', { name: 'Download frozen PDF' });
			await expect(documentLink).toBeVisible();
			const documentHref = await documentLink.getAttribute('href');
			if (!documentHref) throw new Error('Won flow did not render the frozen PDF link.');
			const documentResponse = await page.evaluate(async (href) => {
				const response = await fetch(href);
				return {
					status: response.status,
					contentType: response.headers.get('content-type'),
					bytes: (await response.arrayBuffer()).byteLength
				};
			}, documentHref);
			expect(documentResponse.status).toBe(200);
			expect(documentResponse.contentType).toContain('application/pdf');
			expect(documentResponse.bytes).toBeGreaterThan(0);

			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByText('waiting_on_client', { exact: true })).toBeVisible();
			await expect(page.getByText('Follow up on sent quote', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Mark won and create Client' })).toBeVisible();
			await page.getByRole('button', { name: 'Mark won and create Client' }).click();
			await expect(page.getByText(/Converted to Client/)).toBeVisible();
			await expect(page.getByText('WON', { exact: true })).toBeVisible();

			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('WON');
			const client = await readClientForLead(lead.id, user);
			expect(client?.status).toBe('active');
			expect(client?.source_lead_id).toBe(lead.id);
			if (!client?.id) throw new Error('Won flow did not create a Client.');
			const contacts = await readClientContacts(client.id, user);
			expect(
				contacts.filter((contact) => contact.is_primary && contact.status === 'active')
			).toHaveLength(1);
			const quotes = await readQuotesForLead(lead.id, user);
			expect(quotes[0]?.status).toBe('sent');
			expect(Number(quotes[0]?.total)).toBe(3450);
			expect(quotes[0]?.document_path).toBeTruthy();

			await page.goto(`/clients/${client.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
			await expect(page.getByText('Source Lead', { exact: true })).toBeVisible();
			await page.reload({ waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Activity history' })).toBeVisible();
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
