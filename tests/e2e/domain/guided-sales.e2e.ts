import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { cleanupLeadData, cleanupUser, createStaff, ingestLead, signIn } from './helpers';

test('Sales selects bounded work, paginates and continues at the record on mobile', async ({
	page
}) => {
	test.setTimeout(120_000);
	const user = await createStaff('sales', 'guided-sales');
	const label = `guided${randomUUID().slice(0, 8)}`;
	const leads: string[] = [];
	try {
		for (let i = 0; i < 51; i++) leads.push((await ingestLead(`${label}${i}`)).id);
		await signIn(page, user);
		await page.goto(`/sales?view=new&q=${label}`);
		await expect(page.getByRole('heading', { name: 'Sales', exact: true })).toBeVisible();
		await expect(
			page.getByRole('navigation', { name: 'Sales work views' }).getByRole('link')
		).toHaveText(['Needs attention', 'New', 'Reviewing', 'Quote needed', 'Waiting', 'All']);
		const list = page.getByRole('list', { name: 'Enquiries' });
		await expect(list.getByRole('listitem')).toHaveCount(50);
		await expect(list.locator('form')).toHaveCount(0);
		await page.getByRole('link', { name: 'Next', exact: true }).click();
		await expect(list.getByRole('listitem')).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Next', exact: true })).toHaveCount(0);
		await page.setViewportSize({ width: 390, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		const continueLink = list.getByRole('link', { name: /Continue/ });
		await expect(continueLink).toBeVisible();
		await continueLink.scrollIntoViewIfNeeded();
		const href = await continueLink.getAttribute('href');
		expect(href).toMatch(/\/leads\/[a-f0-9-]+$/);
		await continueLink.click();
		await expect(page).toHaveURL(new RegExp(`${href!.replaceAll('/', '\\/')}$`), {
			timeout: 30_000
		});
	} finally {
		for (const id of leads) await cleanupLeadData(id);
		await cleanupUser(user.id);
	}
});
