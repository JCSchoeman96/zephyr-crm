import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
	apiUrl,
	authenticatedRpc,
	cleanupUser,
	createStaff,
	ingestLead,
	readLead,
	readQuotesForLead,
	serviceRoleKey,
	signIn,
	type StaffUser
} from './helpers';

type FixtureLead = Awaited<ReturnType<typeof ingestLead>> & { company: string };
type Fixture = {
	user: StaffUser;
	leads: {
		enquiry: FixtureLead;
		qualification: FixtureLead;
		proposalNotStarted: FixtureLead;
		proposalDraft: FixtureLead;
		proposalReady: FixtureLead;
		decisionCurrent: FixtureLead;
		decisionStale: FixtureLead;
	};
};

async function startQualification(lead: FixtureLead, user: StaffUser, notes?: string) {
	const current = await readLead(lead.id, user);
	if (!current) throw new Error(`Could not read ${lead.id} before qualification.`);
	await authenticatedRpc(
		'start_lead_qualification',
		{
			p_lead_id: lead.id,
			p_lock_version: current.lock_version,
			p_qualification_notes: notes ?? null
		},
		user
	);
}

async function ingestFixture(label: string): Promise<FixtureLead> {
	return { ...(await ingestLead(label)), company: `P14 ${label} Company` };
}

async function makeProposal(lead: FixtureLead, user: StaffUser, notes = 'Qualified enquiry') {
	await startQualification(lead, user, notes);
	const current = await readLead(lead.id, user);
	if (!current) throw new Error(`Could not read ${lead.id} before proposal readiness.`);
	await authenticatedRpc(
		'ready_lead_for_quote',
		{
			p_lead_id: lead.id,
			p_lock_version: current.lock_version,
			p_qualification_notes: notes
		},
		user
	);
}

async function makeDecision(lead: FixtureLead, user: StaffUser) {
	await makeProposal(lead, user, 'Decision-stage fixture enquiry');
	const current = await readLead(lead.id, user);
	if (!current) throw new Error(`Could not read ${lead.id} before decision readiness.`);
	await authenticatedRpc(
		'transition_lead',
		{ p_lead_id: lead.id, p_to_stage: 'DECISION', p_lock_version: current.lock_version },
		user
	);
}

async function createDraftQuote(lead: FixtureLead, user: StaffUser, label: string) {
	return (await authenticatedRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `P18 ${label} quote`,
			p_introduction: 'P18 browser fixture',
			p_terms: 'P18 terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [
				{ name: `P18 ${label} service`, quantity: '1', unit_price: '1000.00', taxable: true }
			]
		},
		user
	)) as { quote_id: string; lock_version: number };
}

async function createReadyQuote(lead: FixtureLead, user: StaffUser, label: string) {
	return (await authenticatedRpc(
		'create_minimal_quote',
		{
			p_lead_id: lead.id,
			p_subject: `P18 ${label} quote`,
			p_item_name: `P18 ${label} service`,
			p_quantity: '1',
			p_unit_price: '1000.00',
			p_tax_rate: '15'
		},
		user
	)) as { quote_id: string; lock_version: number };
}

async function createSentQuote(lead: FixtureLead, user: StaffUser, label: string) {
	const ready = await createReadyQuote(lead, user, label);
	const prepared = (await authenticatedRpc(
		'prepare_quote_send',
		{ p_quote_id: ready.quote_id, p_lock_version: ready.lock_version },
		user
	)) as { outbound_message_id: string };
	await authenticatedRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `p18-browser-${ready.quote_id}`
		},
		user
	);
	const quotes = await readQuotesForLead(lead.id, user);
	const sent = quotes.find((quote) => quote.id === ready.quote_id && quote.status === 'sent');
	if (!sent?.id) throw new Error(`Could not create sent Quote for ${lead.id}.`);
	return sent.id;
}

async function createFixture(): Promise<Fixture> {
	const user = await createStaff('owner', 'p18-browser');
	const suffix = randomUUID().slice(0, 8);
	const leads = {
		enquiry: await ingestFixture(`p18-enquiry-${suffix}`),
		qualification: await ingestFixture(`p18-qualification-${suffix}`),
		proposalNotStarted: await ingestFixture(`p18-proposal-not-started-${suffix}`),
		proposalDraft: await ingestFixture(`p18-proposal-draft-${suffix}`),
		proposalReady: await ingestFixture(`p18-proposal-ready-${suffix}`),
		decisionCurrent: await ingestFixture(`p18-decision-current-${suffix}`),
		decisionStale: await ingestFixture(`p18-decision-stale-${suffix}`)
	};

	await startQualification(
		leads.qualification,
		user,
		'Qualification evidence from the first call.'
	);
	await makeProposal(leads.proposalNotStarted, user);
	await makeProposal(leads.proposalDraft, user);
	await makeProposal(leads.proposalReady, user);
	await createDraftQuote(leads.proposalDraft, user, 'draft');
	await createReadyQuote(leads.proposalReady, user, 'ready');
	await makeDecision(leads.decisionCurrent, user);
	await makeDecision(leads.decisionStale, user);
	await createSentQuote(leads.decisionCurrent, user, 'current');
	await createSentQuote(leads.decisionStale, user, 'stale');
	await createDraftQuote(leads.decisionStale, user, 'newer draft');

	return { user, leads };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
	const paths = Object.values(fixture.leads).flatMap((lead) => [
		`/rest/v1/inbound_submissions?lead_id=eq.${lead.id}`,
		`/rest/v1/tasks?lead_id=eq.${lead.id}`,
		`/rest/v1/activities?lead_id=eq.${lead.id}`,
		`/rest/v1/outbound_messages?lead_id=eq.${lead.id}`,
		`/rest/v1/quotes?lead_id=eq.${lead.id}`,
		`/rest/v1/clients?source_lead_id=eq.${lead.id}`,
		`/rest/v1/leads?id=eq.${lead.id}`
	]);
	for (const path of paths) {
		await fetch(`${apiUrl}${path}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		}).catch(() => {});
	}
	await cleanupUser(fixture.user.id);
}

async function submitFormButton(button: import('@playwright/test').Locator) {
	await button.evaluate((element) => {
		const button = element;
		const form = button.closest('form');
		if (!(form instanceof HTMLFormElement)) throw new Error('Action form not found.');
		form.requestSubmit();
	});
}

test.describe('P18 Sales work queues', () => {
	test('keeps the four queues stage-derived and navigable through authenticated browser actions', async ({
		page
	}) => {
		test.setTimeout(90_000);
		const fixture = await createFixture();
		try {
			await signIn(page, fixture.user);
			const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
			await expect(navigation.getByRole('link', { name: 'New Enquiries' })).toBeVisible();
			await expect(navigation.getByRole('link', { name: 'Quotes to Prepare' })).toBeVisible();
			await expect(navigation.getByRole('link', { name: 'Fulfilment' })).toBeVisible();
			await expect(navigation.getByRole('link', { name: 'Clients' })).toBeVisible();
			await expect(navigation.getByRole('link', { name: 'Tasks' })).toBeVisible();

			await page.goto('/sales/enquiries', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'New Enquiries' })).toBeVisible();
			await expect(page.getByText(fixture.leads.enquiry.company)).toBeVisible();
			await expect(page.getByText(fixture.leads.qualification.company)).toHaveCount(0);
			const enquiryRow = page.getByRole('row').filter({ hasText: fixture.leads.enquiry.company });
			await expect(enquiryRow.getByRole('button', { name: 'Start Qualification' })).toBeVisible();
			await submitFormButton(enquiryRow.getByRole('button', { name: 'Start Qualification' }));
			await expect(page).toHaveURL(/\/sales\/enquiries$/);
			await expect(page.getByText(fixture.leads.enquiry.company)).toHaveCount(0);

			await page.goto('/sales/qualification', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Qualification' })).toBeVisible();
			await expect(page.getByText(fixture.leads.qualification.company)).toBeVisible();
			const qualificationRow = page
				.getByRole('row')
				.filter({ hasText: fixture.leads.qualification.company });
			await qualificationRow
				.getByLabel('Qualification notes')
				.fill('Confirmed budget and delivery requirements.');
			await expect(qualificationRow.getByRole('button', { name: 'Ready for Quote' })).toBeVisible();
			await submitFormButton(qualificationRow.getByRole('button', { name: 'Ready for Quote' }));
			await expect(page).toHaveURL(/\/sales\/qualification$/);
			await expect(page.getByText(fixture.leads.qualification.company)).toHaveCount(0);
			const qualifiedLead = await readLead(fixture.leads.qualification.id, fixture.user);
			expect(qualifiedLead?.qualification_notes).toBe(
				'Confirmed budget and delivery requirements.'
			);

			await page.goto('/sales/proposals', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Quotes to Prepare' })).toBeVisible();
			await expect(page.getByText(fixture.leads.proposalNotStarted.company)).toBeVisible();
			await expect(page.getByText(fixture.leads.proposalDraft.company)).toBeVisible();
			await expect(page.getByText(fixture.leads.proposalReady.company)).toBeVisible();
			const proposalNotStartedRow = page
				.getByRole('row')
				.filter({ hasText: fixture.leads.proposalNotStarted.company });
			const proposalDraftRow = page
				.getByRole('row')
				.filter({ hasText: fixture.leads.proposalDraft.company });
			const proposalReadyRow = page
				.getByRole('row')
				.filter({ hasText: fixture.leads.proposalReady.company });
			await expect(proposalNotStartedRow.getByText('Not started', { exact: true })).toBeVisible();
			await expect(proposalDraftRow.getByText('Draft', { exact: true })).toBeVisible();
			await expect(proposalReadyRow.getByText('Ready to send', { exact: true })).toBeVisible();
			await expect(
				proposalNotStartedRow.getByRole('link', { name: 'Create quote' })
			).toHaveAttribute(
				'href',
				new RegExp(`/quotes/new\\?lead_id=${fixture.leads.proposalNotStarted.id}`)
			);
			await proposalNotStartedRow
				.getByRole('link', { name: 'Create quote' })
				.click({ noWaitAfter: true });
			await page.waitForURL(/\/quotes\/new\?lead_id=/);
			await expect(page.getByLabel('Enquiry')).toHaveValue(fixture.leads.proposalNotStarted.id);

			await page.goto('/sales/decisions', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Awaiting Feedback' })).toBeVisible();
			await expect(page.getByText(fixture.leads.decisionCurrent.company)).toBeVisible();
			await expect(page.getByText(fixture.leads.decisionStale.company)).toHaveCount(0);
			const decisionRow = page
				.getByRole('row')
				.filter({ hasText: fixture.leads.decisionCurrent.company });
			await expect(decisionRow.getByLabel('Acceptance source')).toBeVisible();
			await expect(decisionRow.getByLabel('Acceptance evidence')).toBeVisible();
			await expect(decisionRow.getByRole('button', { name: 'Accept sale' })).toBeVisible();
			await expect(decisionRow.getByRole('button', { name: 'Adjust / Requote' })).toBeVisible();
			await expect(decisionRow.getByRole('button', { name: 'Decline quote' })).toBeVisible();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	test('keeps queue layouts usable at mobile, tablet, and desktop widths', async ({ page }) => {
		test.setTimeout(90_000);
		const fixture = await createFixture();
		try {
			await signIn(page, fixture.user);
			for (const viewport of [
				{ width: 390, height: 844 },
				{ width: 768, height: 1024 },
				{ width: 1280, height: 900 }
			]) {
				await page.setViewportSize(viewport);
				for (const path of [
					'/sales/enquiries',
					'/sales/qualification',
					'/sales/proposals',
					'/sales/decisions'
				]) {
					await page.goto(path, { waitUntil: 'networkidle' });
					await expect(page.locator('h1')).toBeVisible();
					const fitsViewport = await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth + 1
					);
					expect(fitsViewport, `${path} overflows at ${viewport.width}px`).toBe(true);
				}
			}
		} finally {
			await cleanupFixture(fixture);
		}
	});
});
