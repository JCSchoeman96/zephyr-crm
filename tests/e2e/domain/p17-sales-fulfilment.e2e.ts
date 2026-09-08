import { expect, test } from '@playwright/test';
import {
	cleanupLead,
	createStaff,
	gotoAndWaitForHeading,
	ingestLead,
	readClientContacts,
	readClientForLead,
	readFulfilmentCasesForQuote,
	readLead,
	readQuotesForLead,
	signIn
} from './helpers';

test.describe('P17 Sales-to-Fulfilment tracer bullet', () => {
	test('accepts a sent Quote in the authenticated browser and creates the handoff', async ({
		page
	}) => {
		const user = await createStaff('owner', 'p17-browser');
		const lead = await ingestLead('p17-browser');
		try {
			await signIn(page, user);
			await gotoAndWaitForHeading(page, `/leads/${lead.id}`, 'P14 Browser Harness');
			await page.getByRole('button', { name: 'Review enquiry' }).click();
			await page.getByRole('button', { name: 'Ready for quote' }).click();
			await page.getByRole('link', { name: 'Create quote', exact: true }).click();
			await page.waitForURL(/\/quotes\/new\?lead_id=/);
			await page.locator('#quote-subject').fill('P17 browser acceptance');
			await page.getByRole('button', { name: 'Add custom item' }).click();
			await page.locator('#quote-item-name-0').fill('P17 installation');
			await page.locator('#quote-item-quantity-0').fill('1');
			await page.locator('#quote-item-price-0').fill('1000');
			await page.getByRole('button', { name: 'Save draft' }).click();
			await page.waitForURL(/\/quotes\/[0-9a-f-]+$/);
			await page.getByRole('button', { name: 'Review quote' }).click();
			await expect(page.getByRole('button', { name: 'Send quote' })).toBeVisible();
			await page.getByRole('button', { name: 'Send quote' }).evaluate((button) => {
				const form = button.closest('form');
				if (!(form instanceof HTMLFormElement)) throw new Error('Send quote form not found.');
				form.requestSubmit();
			});
			await expect(page.getByText('submitted', { exact: true })).toBeVisible();
			await page.getByRole('radio', { name: 'Customer accepted' }).check();
			await page.getByLabel('Acceptance source').fill('customer_email');
			await page
				.getByLabel('Acceptance evidence')
				.fill('Customer approved the Quote by email during the P17 browser journey.');
			await page.getByRole('button', { name: 'Customer accepted' }).evaluate((button) => {
				const form = button.closest('form');
				if (!(form instanceof HTMLFormElement))
					throw new Error('Customer accepted form not found.');
				form.requestSubmit();
			});
			await expect(
				page.locator('[data-tone="success"]').filter({ hasText: /^Accepted$/ })
			).toBeVisible();

			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('WON');
			const client = await readClientForLead(lead.id, user);
			if (!client?.id) throw new Error('P17 browser acceptance did not create a Client.');
			const contacts = await readClientContacts(client.id, user);
			const quotes = await readQuotesForLead(lead.id, user);
			const acceptedQuote = quotes.find((quote) => quote.status === 'accepted');
			if (!acceptedQuote?.id) throw new Error('P17 browser acceptance did not accept the Quote.');
			const cases = await readFulfilmentCasesForQuote(acceptedQuote.id, user);
			expect(client.source_lead_id).toBe(lead.id);
			expect(
				contacts.filter((contact) => contact.status === 'active' && contact.is_primary)
			).toHaveLength(1);
			expect(cases).toHaveLength(1);
			expect(cases[0]).toMatchObject({
				client_id: client.id,
				lead_id: lead.id,
				accepted_quote_id: acceptedQuote.id
			});
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});
});
