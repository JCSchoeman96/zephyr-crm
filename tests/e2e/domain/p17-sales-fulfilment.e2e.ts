import { expect, test } from '@playwright/test';
import {
	apiUrl,
	createStaff,
	cleanupUser,
	ingestLead,
	readClientContacts,
	readClientForLead,
	readFulfilmentCasesForQuote,
	readLead,
	readQuotesForLead,
	serviceRoleKey,
	signIn
} from './helpers';

async function cleanupP17Lead(leadId: string, userId: string): Promise<void> {
	const paths = [
		`/rest/v1/fulfilment_cases?lead_id=eq.${leadId}`,
		`/rest/v1/tasks?lead_id=eq.${leadId}`,
		`/rest/v1/activities?lead_id=eq.${leadId}`,
		`/rest/v1/outbound_messages?lead_id=eq.${leadId}`,
		`/rest/v1/quotes?lead_id=eq.${leadId}`,
		`/rest/v1/clients?source_lead_id=eq.${leadId}`,
		`/rest/v1/leads?id=eq.${leadId}`
	];
	for (const path of paths) {
		await fetch(`${apiUrl}${path}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		}).catch(() => {});
	}
	await cleanupUser(userId);
}

test.describe('P17 Sales-to-Fulfilment tracer bullet', () => {
	test('accepts a sent Quote in the authenticated browser and creates the handoff', async ({
		page
	}) => {
		const user = await createStaff('owner', 'p17-browser');
		const lead = await ingestLead('p17-browser');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await page.getByRole('button', { name: 'Start Qualification' }).click();
			await page.getByRole('button', { name: 'Ready for Quote' }).click();
			await expect(page.getByRole('heading', { name: 'Create a simple quote' })).toBeVisible();
			await page.locator('input[name="subject"]').fill('P17 browser acceptance');
			await page.locator('input[name="item_name"]').fill('P17 installation');
			await page.locator('input[name="quantity"]').fill('1');
			await page.locator('input[name="unit_price"]').fill('1000');
			await page.locator('input[name="tax_rate"]').fill('15');
			await page.getByRole('button', { name: 'Create quote' }).click();
			await page.getByRole('link', { name: 'P17 browser acceptance' }).click({ noWaitAfter: true });
			await page.waitForURL(/\/quotes\/[0-9a-f-]+$/);
			await expect(page.getByRole('button', { name: 'Send quote' })).toBeVisible();
			await page.getByRole('button', { name: 'Send quote' }).evaluate((button) => {
				const form = button.closest('form');
				if (!(form instanceof HTMLFormElement)) throw new Error('Send quote form not found.');
				form.requestSubmit();
			});
			await expect(page.getByText('submitted', { exact: true })).toBeVisible();
			await page.getByLabel('Acceptance source').fill('customer_email');
			await page
				.getByLabel('Acceptance evidence')
				.fill('Customer approved the Quote by email during the P17 browser journey.');
			await page.getByRole('button', { name: 'Accept sale' }).evaluate((button) => {
				const form = button.closest('form');
				if (!(form instanceof HTMLFormElement)) throw new Error('Accept sale form not found.');
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
			await cleanupP17Lead(lead.id, user.id);
		}
	});
});
