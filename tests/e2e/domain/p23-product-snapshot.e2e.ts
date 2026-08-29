import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
	authenticatedRpc,
	cleanupLeadData,
	cleanupUser,
	createStaff,
	ingestLead,
	readLead,
	runCleanup,
	signIn,
	type StaffUser
} from './helpers';

function localDatabaseUrl(): string {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	const line = output.split('\n').find((value) => value.startsWith('DB_URL='));
	if (!line) throw new Error('Local Supabase DB_URL is unavailable for Product cleanup.');
	return line.slice('DB_URL='.length).replace(/^"(.*)"$/, '$1');
}

function cleanupProductFixtures(productIds: string[]): void {
	if (productIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
		throw new Error('Invalid Product cleanup ID.');
	if (productIds.length === 0) return;
	const products = productIds.map((id) => `'${id}'::uuid`).join(',');
	const query = [
		'begin',
		'alter table public.activities disable trigger activities_append_only',
		`delete from public.activities where product_id in (${products})`,
		`delete from public.products where id in (${products})`,
		'alter table public.activities enable trigger activities_append_only',
		'commit'
	].join(';');
	execFileSync('psql', [localDatabaseUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `${query};`], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

type ProductActionResult = { product_id: string; lock_version: number };
type QuoteActionResult = { quote_id: string; lock_version: number; quote_lock_version?: number };

async function moveLeadToDecision(leadId: string, user: StaffUser) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await readLead(leadId, user);
		if (!current) throw new Error(`Could not read Lead ${leadId}.`);
		await authenticatedRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			user
		);
	}
}

test('Product-to-Quote snapshot remains customer-facing after Product mutation', async ({
	page
}) => {
	test.setTimeout(90_000);
	const owner = await createStaff('owner', 'p23-browser-snapshot');
	const leadIds: string[] = [];
	const productIds: string[] = [];

	try {
		const lead = await ingestLead('p23-browser-snapshot');
		leadIds.push(lead.id);
		await moveLeadToDecision(lead.id, owner);

		const draft = (await authenticatedRpc(
			'save_quote_draft',
			{
				p_quote_id: null,
				p_lock_version: null,
				p_lead_id: lead.id,
				p_client_id: null,
				p_subject: 'P23 browser snapshot quote',
				p_introduction: 'Customer-facing snapshot proof',
				p_terms: 'P23 browser terms',
				p_tax_label: 'VAT',
				p_tax_rate: '15',
				p_valid_until: '2099-12-31',
				p_currency: 'ZAR',
				p_items: [
					{
						name: 'Existing custom line',
						quantity: '1',
						unit_price: '10.0000',
						taxable: true
					}
				]
			},
			owner
		)) as QuoteActionResult;

		const created = (await authenticatedRpc(
			'create_product',
			{
				p_product_code: 'P23-BROWSER-001',
				p_name: 'Browser Snapshot Service',
				p_customer_description: 'Customer-visible snapshot description',
				p_internal_notes: 'Private Product note must never appear in the Quote',
				p_kind: 'service',
				p_unit_label: 'hour',
				p_currency: 'ZAR',
				p_unit_price: '125.5000',
				p_taxable: true
			},
			owner
		)) as ProductActionResult;
		productIds.push(created.product_id);
		const activated = (await authenticatedRpc(
			'activate_product',
			{ p_product_id: created.product_id, p_lock_version: created.lock_version },
			owner
		)) as ProductActionResult;

		const selected = (await authenticatedRpc(
			'add_product_quote_item',
			{
				p_quote_id: draft.quote_id,
				p_quote_lock_version: draft.lock_version,
				p_product_id: created.product_id,
				p_product_lock_version: activated.lock_version,
				p_quantity: '2.1250'
			},
			owner
		)) as QuoteActionResult;
		const ready = (await authenticatedRpc(
			'mark_quote_ready',
			{ p_quote_id: draft.quote_id, p_lock_version: selected.quote_lock_version },
			owner
		)) as { lock_version: number; status: string };
		expect(ready.status).toBe('ready');

		await signIn(page, owner);
		const quoteResponse = await page.goto(`/quotes/${draft.quote_id}`, {
			waitUntil: 'networkidle'
		});
		expect(quoteResponse?.status()).toBe(200);
		await expect(page.getByText('Browser Snapshot Service', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Unit price').nth(1)).toHaveValue('125.5');
		const initialBody = await page.locator('body').innerText();
		expect(initialBody).not.toContain('Private Product note must never appear in the Quote');

		await authenticatedRpc(
			'change_product_price',
			{
				p_product_id: created.product_id,
				p_lock_version: activated.lock_version,
				p_unit_price: '999.9999',
				p_reason: 'Browser snapshot mutation proof'
			},
			owner
		);
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.getByText('Browser Snapshot Service', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Unit price').nth(1)).toHaveValue('125.5');
		await expect(page.getByLabel('Unit price').nth(1)).not.toHaveValue('999.9999');
		const finalBody = await page.locator('body').innerText();
		expect(finalBody).not.toContain('Private Product note must never appear in the Quote');
	} finally {
		await runCleanup([
			...leadIds.map((leadId) => ({
				label: `Lead ${leadId}`,
				run: () => cleanupLeadData(leadId)
			})),
			{ label: 'Product fixtures', run: async () => cleanupProductFixtures(productIds) },
			{ label: `auth user ${owner.id}`, run: () => cleanupUser(owner.id) }
		]);
	}
});
