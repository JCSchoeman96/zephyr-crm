import { expect, test } from '@playwright/test';
import {
	apiUrl,
	cleanupUser,
	createStaff,
	ingestLead,
	readClientForLead,
	readFulfilmentCasesForQuote,
	readLead,
	readQuotesForLead,
	serviceRoleKey,
	signIn
} from './helpers';

async function cleanupP19Lead(leadId: string, userId: string): Promise<void> {
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

async function submitFormButton(button: import('@playwright/test').Locator) {
	await button.evaluate((element) => {
		const form = element.closest('form');
		if (!(form instanceof HTMLFormElement)) throw new Error('Action form not found.');
		form.requestSubmit();
	});
}

test.describe('P19 Fulfilment work queues', () => {
	test('renders the accepted-sale queues and drives canonical work, payment, and follow-up actions', async ({
		page
	}) => {
		test.setTimeout(120_000);
		const user = await createStaff('owner', 'p19-browser');
		const lead = await ingestLead('p19-browser');
		try {
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await page.getByRole('button', { name: 'Qualify lead' }).click();
			await page.getByRole('button', { name: 'Move to proposal' }).click();
			await expect(page.getByRole('heading', { name: 'Create a simple quote' })).toBeVisible();
			await page.locator('input[name="subject"]').fill('P19 browser acceptance');
			await page.locator('input[name="item_name"]').fill('P19 fulfilment installation');
			await page.locator('input[name="quantity"]').fill('1');
			await page.locator('input[name="unit_price"]').fill('1000');
			await page.locator('input[name="tax_rate"]').fill('15');
			await page.getByRole('button', { name: 'Create quote' }).click();
			await page.getByRole('link', { name: 'P19 browser acceptance' }).click({ noWaitAfter: true });
			await page.waitForURL(/\/quotes\/[0-9a-f-]+$/);
			await expect(page.getByRole('button', { name: 'Send quote' })).toBeVisible();
			await submitFormButton(page.getByRole('button', { name: 'Send quote' }));
			await expect(page.getByText('submitted', { exact: true })).toBeVisible();
			await page.getByLabel('Acceptance source').fill('customer_email');
			await page
				.getByLabel('Acceptance evidence')
				.fill('Customer approved the Quote by email during the P19 browser journey.');
			await submitFormButton(page.getByRole('button', { name: 'Accept sale' }));
			await expect(
				page.locator('[data-tone="success"]').filter({ hasText: /^accepted$/ })
			).toBeVisible();

			const quotes = await readQuotesForLead(lead.id, user);
			const acceptedQuote = quotes.find((quote) => quote.id && quote.status === 'accepted');
			if (!acceptedQuote?.id)
				throw new Error('P19 browser acceptance did not create an accepted Quote.');
			const cases = await readFulfilmentCasesForQuote(acceptedQuote.id, user);
			if (cases.length !== 1)
				throw new Error('P19 browser acceptance did not create one FulfilmentCase.');
			const client = await readClientForLead(lead.id, user);
			if (!client?.id) throw new Error('P19 browser acceptance did not create a Client.');
			await expect.poll(async () => (await readLead(lead.id, user))?.pipeline_stage).toBe('WON');

			await page.goto('/fulfilment', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Fulfilment' })).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Needs Planning' })).toBeVisible();
			const caseHref = `/fulfilment/${cases[0].id}`;
			const queueRow = page.locator('tr').filter({ has: page.locator(`a[href="${caseHref}"]`) });
			await expect(queueRow).toHaveCount(1);
			await expect(queueRow.getByRole('link', { name: /Fulfilment #/ })).toBeVisible();
			await queueRow.getByRole('link', { name: /Open case/ }).click();
			await page.waitForURL(new RegExp(`/fulfilment/${cases[0].id}$`));
			for (const heading of ['Overview', 'Work', 'Payments', 'Tasks', 'Activity']) {
				await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
			}
			await expect(page.getByText('P19 browser acceptance')).toBeVisible();
			await expect(page.getByText(client.display_name ?? 'Client unavailable')).toBeVisible();

			await page.getByLabel('Work type').selectOption('installation');
			await page.getByLabel('Notes', { exact: true }).fill('P19 browser installation');
			await submitFormButton(page.getByRole('button', { name: 'Add work step' }));
			await expect(page.getByText('Awaiting Schedule', { exact: true })).toBeVisible();
			await page.getByLabel('Schedule for').fill('2099-01-01T09:00');
			await submitFormButton(page.getByRole('button', { name: 'Schedule installation' }));
			await expect(page.locator('[data-tone]').filter({ hasText: /^Scheduled$/ })).toBeVisible();
			await page.getByLabel('New schedule').fill('2099-01-02T09:00');
			await submitFormButton(page.getByRole('button', { name: 'Reschedule' }));
			await expect(page.locator('[data-tone]').filter({ hasText: /^Scheduled$/ })).toBeVisible();
			await submitFormButton(page.getByRole('button', { name: 'Complete installation' }));
			await expect(
				page.locator('.step-card [data-tone]').filter({ hasText: /^Completed$/ })
			).toBeVisible();

			await page.getByLabel('Work type').selectOption('courier');
			await submitFormButton(page.getByRole('button', { name: 'Add work step' }));
			await expect(page.getByText('Awaiting Dispatch', { exact: true })).toBeVisible();
			const dispatchForm = page.locator('form[action="?/dispatch"]');
			await dispatchForm.getByLabel('Tracking reference').fill('P19-TRACK-001');
			await dispatchForm.getByLabel('Dispatch notes').fill('Handed to courier');
			await submitFormButton(dispatchForm.getByRole('button', { name: 'Dispatch courier' }));
			await expect(page.getByText('Dispatched', { exact: true })).toBeVisible();
			await submitFormButton(page.getByRole('button', { name: 'Confirm delivery' }));
			await expect(page.getByText('Delivered', { exact: true })).toBeVisible();

			await page.getByLabel('Work type').selectOption('pickup');
			await submitFormButton(page.getByRole('button', { name: 'Add work step' }));
			await expect(page.getByText('Preparing', { exact: true })).toBeVisible();
			const readyForm = page.locator('form[action="?/ready"]');
			await readyForm.getByLabel('Readiness notes').fill('Packed and ready');
			await submitFormButton(readyForm.getByRole('button', { name: 'Mark ready for collection' }));
			await expect(page.getByText('Ready For Collection', { exact: true })).toBeVisible();
			await submitFormButton(page.getByRole('button', { name: 'Confirm collection' }));
			await expect(page.locator('[data-tone]').filter({ hasText: /^Collected$/ })).toBeVisible();

			const depositCard = page.locator('.payment-card').filter({ hasText: 'Deposit' });
			await submitFormButton(depositCard.getByRole('button', { name: 'Request payment evidence' }));
			await expect(
				depositCard.locator('[data-tone]').filter({ hasText: /^Awaiting$/ })
			).toBeVisible();
			await depositCard
				.getByLabel('Receipt evidence note')
				.fill('Deposit evidence recorded in CRM.');
			await submitFormButton(depositCard.getByRole('button', { name: 'Record received' }));
			await expect(
				depositCard.locator('[data-tone]').filter({ hasText: /^Received$/ })
			).toBeVisible();

			const finalBalanceCard = page.locator('.payment-card').filter({ hasText: 'Final Balance' });
			await finalBalanceCard
				.getByLabel('Why not required?')
				.fill('No final balance due for this accepted sale.');
			await submitFormButton(finalBalanceCard.getByRole('button', { name: 'Mark not required' }));
			await expect(
				finalBalanceCard.locator('[data-tone]').filter({ hasText: /^Not Required$/ })
			).toBeVisible();

			await page.getByLabel('Payment follow-up title').fill('Confirm payment evidence');
			await page.getByLabel('Description').fill('P19 browser follow-up evidence.');
			await submitFormButton(page.getByRole('button', { name: 'Create or reuse follow-up' }));
			await expect(page.getByText('P19 browser follow-up evidence.')).toBeVisible();

			await submitFormButton(page.getByRole('button', { name: 'Complete case' }));
			await expect(
				page.locator('section[aria-labelledby="overview-heading"] [data-tone]').filter({
					hasText: /^Completed$/
				})
			).toBeVisible();
			await page.goto('/fulfilment', { waitUntil: 'networkidle' });
			const completedQueue = page
				.locator('.queue-card')
				.filter({ has: page.getByRole('heading', { name: 'Completed', exact: true }) });
			await expect(
				completedQueue.locator(`a.fulfilment-queue-table__case[href="${caseHref}"]`)
			).toBeVisible();
		} finally {
			await cleanupP19Lead(lead.id, user.id);
		}
	});
});
