import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLead,
	createStaff,
	cleanupUser,
	ingestLead,
	readLead,
	signIn,
	signInWithAal2
} from './helpers';

async function moveLeadToDecision(leadId: string, user: Awaited<ReturnType<typeof createStaff>>) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await readLead(leadId, user);
		if (!current) throw new Error(`Could not read disposable Lead ${leadId}.`);
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			user
		);
	}
}

async function moveLeadToProposal(leadId: string, user: Awaited<ReturnType<typeof createStaff>>) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL']) {
		const current = await readLead(leadId, user);
		if (!current) throw new Error(`Could not read disposable Lead ${leadId}.`);
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			user
		);
	}
}

async function createDraft(leadId: string, user: Awaited<ReturnType<typeof createStaff>>) {
	return (await authenticatedRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: leadId,
			p_client_id: null,
			p_subject: 'V151 operational preview',
			p_introduction: 'A disposable preview fixture.',
			p_terms: 'Payment terms wrap at word boundaries in the customer preview.',
			p_tax_label: 'VAT',
			p_tax_rate: '15',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [
				{
					name: 'Operational preview line',
					description: 'A disposable line for layout evidence.',
					quantity: '1',
					unit_price: '1000.00',
					taxable: true
				}
			]
		},
		user
	)) as { quote_id: string };
}

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for quote-default cleanup.');
	const value = line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
	const hostname = new URL(value).hostname;
	if (!['127.0.0.1', 'localhost'].includes(hostname))
		throw new Error('Quote-default cleanup requires a localhost Supabase DB_URL.');
	return value;
}

function readStoredQuoteDefaults(): string {
	return execFileSync(
		'psql',
		[
			localDatabaseUrl(),
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-At',
			'-c',
			"select coalesce(setting_value::text, '{}') from public.app_settings where setting_key = 'quote_defaults'"
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function restoreStoredQuoteDefaults(value: string): void {
	if (!value || !JSON.parse(value)) throw new Error('Stored Quote defaults were not valid JSON.');
	const encoded = Buffer.from(value).toString('base64');
	execFileSync(
		'psql',
		[
			localDatabaseUrl(),
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-c',
			`update public.app_settings set setting_value = convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb, updated_at = now() where setting_key = 'quote_defaults'`
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
}

test.describe('v1.5.1 operational polish', () => {
	test('desktop Quote preview keeps a usable document width', async ({ page }) => {
		const user = await createStaff('owner', 'v151-preview');
		const lead = await ingestLead('v151-preview');
		try {
			await moveLeadToDecision(lead.id, user);
			const draft = await createDraft(lead.id, user);
			await page.setViewportSize({ width: 1280, height: 900 });
			await signIn(page, user);
			await page.goto(`/quotes/${draft.quote_id}`, { waitUntil: 'networkidle' });
			await expect(page.getByTestId('quote-document-preview')).toBeVisible();
			await expect(page.getByTestId('quote-brand-fallback')).toBeVisible();

			const metrics = await page.locator('.quote-editor-layout').evaluate((layout) => {
				const preview = layout.querySelector('.quote-preview-card');
				const priceCell = layout.querySelector('[data-label="Unit price"]');
				return {
					previewWidth: preview?.getBoundingClientRect().width ?? 0,
					priceWhiteSpace: priceCell ? getComputedStyle(priceCell).whiteSpace : '',
					documentWidth: document.documentElement.scrollWidth,
					viewportWidth: window.innerWidth
				};
			});
			expect(metrics.previewWidth).toBeGreaterThanOrEqual(420);
			expect(metrics.priceWhiteSpace).toBe('nowrap');
			expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);

			await page.setViewportSize({ width: 390, height: 844 });
			const mobile = await page.getByTestId('quote-document-preview').evaluate((preview) => ({
				documentWidth: document.documentElement.scrollWidth,
				viewportWidth: window.innerWidth,
				priceWhiteSpace: getComputedStyle(
					preview.querySelector('[data-label="Unit price"]') as Element
				).whiteSpace,
				termsOverflowWrap: getComputedStyle(preview.querySelector('.document-terms p') as Element)
					.overflowWrap
			}));
			expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth);
			expect(mobile.priceWhiteSpace).toBe('normal');
			expect(mobile.termsOverflowWrap).toBe('break-word');
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});

	test('shows the canonical Quote Builder entry point beside the quick custom journey', async ({
		page
	}) => {
		const user = await createStaff('owner', 'v151-builder-entry');
		const lead = await ingestLead('v151-builder-entry');
		try {
			await moveLeadToProposal(lead.id, user);
			await signIn(page, user);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			const card = page.locator('.quote-create-card');
			await expect(card.getByRole('heading', { name: 'Create a simple quote' })).toBeVisible();
			const builderLink = card.getByRole('link', { name: 'Open Quote Builder' });
			await expect(builderLink).toHaveAttribute('href', `/quotes/new?lead_id=${lead.id}`);
			await expect(card).toContainText(/catalogue Products/i);
			await expect(card.getByLabel('Line item')).toBeVisible();
			await expect(card.getByRole('button', { name: 'Create quote' })).toBeVisible();
		} finally {
			await cleanupLead(lead.id, user.id);
		}
	});

	test('shows the trusted quote-default configuration form for an AAL2 Owner', async ({ page }) => {
		const user = await createStaff('owner', 'v151-quote-defaults');
		const originalQuoteDefaults = readStoredQuoteDefaults();
		try {
			await signInWithAal2(page, user);
			await page.goto('/operations', { waitUntil: 'networkidle' });
			const form = page.locator('form[action="?/saveQuoteDefaults"]');
			await expect(form).toBeVisible();
			for (const label of [
				'Quote prefix',
				'Tax label',
				'Tax rate (%)',
				'Validity (days)',
				'Terms',
				'Bank details'
			]) {
				await expect(form.getByLabel(label, { exact: true })).toBeVisible();
			}
			const disposableBankDetails = `Disposable local bank · Account ${Date.now()}`;
			await form.getByLabel('Quote prefix', { exact: true }).fill('not valid!');
			await form.getByLabel('Bank details', { exact: true }).fill(disposableBankDetails);
			await form.getByRole('button', { name: 'Save Quote defaults' }).click();
			await expect(page.getByRole('alert')).toContainText(/could not be saved/i);
			await expect(page.getByText(disposableBankDetails, { exact: true })).toHaveCount(0);

			await form.getByLabel('Quote prefix', { exact: true }).fill('OA-');
			await form.getByLabel('Tax label', { exact: true }).fill('VAT');
			await form.getByLabel('Tax rate (%)', { exact: true }).fill('15');
			await form.getByLabel('Validity (days)', { exact: true }).fill('45');
			await form.getByLabel('Terms', { exact: true }).fill('Disposable customer-facing terms.');
			await form.getByLabel('Bank details', { exact: true }).fill(disposableBankDetails);
			await form.getByRole('button', { name: 'Save Quote defaults' }).click();
			await page.waitForURL(/\/operations\?saved=quote-defaults$/);
			await expect(page.getByText('Quote defaults saved.', { exact: true })).toBeVisible();
		} finally {
			restoreStoredQuoteDefaults(originalQuoteDefaults);
			await cleanupUser(user.id);
		}
	});

	test('applies server-owned Quote defaults in the canonical Builder', async ({ page }) => {
		const user = await createStaff('owner', 'v151-server-defaults');
		const lead = await ingestLead('v151-server-defaults');
		const originalQuoteDefaults = readStoredQuoteDefaults();
		try {
			await moveLeadToDecision(lead.id, user);
			await signInWithAal2(page, user);
			await page.goto('/operations', { waitUntil: 'networkidle' });
			const operationsForm = page.locator('form[action="?/saveQuoteDefaults"]');
			await operationsForm.getByLabel('Quote prefix', { exact: true }).fill('OPS-');
			await operationsForm.getByLabel('Tax label', { exact: true }).fill('Service tax');
			await operationsForm.getByLabel('Tax rate (%)', { exact: true }).fill('17.5');
			await operationsForm.getByLabel('Validity (days)', { exact: true }).fill('45');
			await operationsForm
				.getByLabel('Terms', { exact: true })
				.fill('Server-owned customer-facing terms.');
			await operationsForm.getByLabel('Bank details', { exact: true }).fill('');
			await operationsForm.getByRole('button', { name: 'Save Quote defaults' }).click();
			await page.waitForURL(/\/operations\?saved=quote-defaults$/);

			await page.goto(`/quotes/new?lead_id=${lead.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'New quote', exact: true })).toBeVisible();
			await expect(page.locator('#quote-tax-label')).toHaveValue('Service tax');
			await expect(page.locator('#quote-tax-rate')).toHaveValue('17.5');
			await expect(page.locator('#quote-terms')).toHaveValue('Server-owned customer-facing terms.');
			const expectedValidUntil = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);
			await expect(page.locator('#quote-valid-until')).toHaveValue(expectedValidUntil);
		} finally {
			restoreStoredQuoteDefaults(originalQuoteDefaults);
			await cleanupLead(lead.id, user.id);
		}
	});
});
