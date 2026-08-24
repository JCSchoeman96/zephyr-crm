import { expect, test, type BrowserContext } from '@playwright/test';
import {
	cleanupLead,
	cleanupUser,
	createConvertedClientFixture,
	createStaff,
	ingestLead,
	lostReasonId,
	signIn,
	signInWithAal2
} from './helpers';

test.describe('P14 role and accessibility regression', () => {
	test('Viewer can read CRM data but receives no mutation or Operations controls', async ({
		page
	}) => {
		const viewer = await createStaff('viewer', 'viewer-read-only');
		const lead = await ingestLead('viewer');
		try {
			await signIn(page, viewer);
			await page.goto(`/leads/${lead.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Lead details' })).toBeVisible();
			await expect(page.getByText('Viewer access is read-only.').first()).toBeVisible();
			await expect(page.getByRole('button', { name: 'Qualify lead' })).toHaveCount(0);

			await page.goto('/tasks', { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Create Task' })).toHaveCount(0);

			const operationsResponse = await page.goto('/operations', { waitUntil: 'networkidle' });
			expect(operationsResponse?.status()).toBe(403);
		} finally {
			await cleanupLead(lead.id, viewer.id);
			await cleanupUser(viewer.id);
		}
	});

	test('Sales can maintain a Client but cannot archive or reopen a Lost Lead', async ({
		page,
		browser
	}) => {
		const fixture = await createConvertedClientFixture('sales-role');
		const sales = await createStaff('sales', 'sales-role');
		const lostLead = await ingestLead('sales-lost');
		let ownerContext: BrowserContext | undefined;
		try {
			await signIn(page, sales);
			await page.goto(`/clients/${fixture.client.id}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('button', { name: 'Save Client details' })).toBeVisible();
			await expect(
				page.getByLabel('Change status').locator('option[value="archived"]')
			).toHaveCount(0);

			await page.goto(`/leads/${lostLead.id}`, { waitUntil: 'networkidle' });
			await page.getByText('Mark lead lost', { exact: true }).click();
			const reason = await lostReasonId(sales);
			await page.getByLabel('Lost reason').selectOption(reason);
			await page.getByLabel('Notes').fill('P14 Sales role Lost');
			await page.getByRole('button', { name: 'Mark lost' }).click();
			await expect(page.getByText('LOST', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Reopen for qualification' })).toHaveCount(0);

			const operationsResponse = await page.goto('/operations', { waitUntil: 'networkidle' });
			expect(operationsResponse?.status()).toBe(403);

			ownerContext = await browser.newContext();
			const ownerPage = await ownerContext.newPage();
			await signIn(ownerPage, fixture.owner);
			await signInWithAal2(ownerPage, fixture.owner);
			await ownerPage.goto(`/leads/${lostLead.id}`, { waitUntil: 'networkidle' });
			await ownerPage.getByLabel('Reopen reason').fill('P14 owner administrative review');
			await ownerPage.getByRole('button', { name: 'Reopen for qualification' }).click();
			await expect(ownerPage.getByText('QUALIFICATION', { exact: true })).toBeVisible();
			await ownerPage.goto('/operations', { waitUntil: 'networkidle' });
			await expect(ownerPage.getByRole('heading', { name: 'Operations' })).toBeVisible();
		} finally {
			await ownerContext?.close();
			await cleanupLead(fixture.lead.id, fixture.owner.id);
			await cleanupLead(lostLead.id, sales.id);
			await cleanupUser(sales.id);
			await cleanupUser(fixture.owner.id);
		}
	});

	test('canonical product pages remain labelled and within all required viewports', async ({
		page
	}) => {
		const fixture = await createConvertedClientFixture('responsive');
		try {
			await signIn(page, fixture.owner);
			for (const viewport of [
				{ width: 390, height: 844 },
				{ width: 768, height: 1024 },
				{ width: 1280, height: 900 }
			]) {
				await page.setViewportSize(viewport);
				for (const path of [
					'/',
					`/leads/${fixture.lead.id}`,
					'/quotes/new',
					'/tasks',
					`/clients/${fixture.client.id}`
				]) {
					const response = await page.goto(path, { waitUntil: 'networkidle' });
					expect(response?.status()).toBe(200);
					const dimensions = await page.evaluate(() => ({
						viewport: window.innerWidth,
						document: document.documentElement.scrollWidth
					}));
					expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
				}
				await page.goto('/quotes/new', { waitUntil: 'networkidle' });
				await expect(page.getByLabel('Subject')).toBeVisible();
				await expect(page.getByLabel('Name')).toBeVisible();
				await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
				await page.goto(`/clients/${fixture.client.id}`, { waitUntil: 'networkidle' });
				await expect(page.getByLabel('Display name')).toBeVisible();
				await expect(page.getByRole('button', { name: 'Save Client details' })).toBeVisible();
			}
		} finally {
			await cleanupLead(fixture.lead.id, fixture.owner.id);
			await cleanupUser(fixture.owner.id);
		}
	});
});
