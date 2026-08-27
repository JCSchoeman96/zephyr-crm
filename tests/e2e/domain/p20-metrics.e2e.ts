import { expect, test } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

test('renders the canonical Sales and Fulfilment metrics with payment evidence boundaries', async ({
	page
}) => {
	const user = await createStaff('owner', 'p20-metrics-browser');
	try {
		await signIn(page, user);
		await page.goto('/', { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('heading', { name: 'Sales and Fulfilment metrics', exact: true })
		).toBeVisible();
		const metricsSection = page.locator(
			'section[aria-labelledby="sales-fulfilment-metrics-heading"]'
		);
		for (const label of [
			'New enquiries waiting',
			'Qualification backlog',
			'Quotes needing preparation',
			'Quotes awaiting decision',
			'Average quote response time',
			'Accepted value',
			'Open fulfilments',
			'Upcoming installations',
			'Awaiting dispatch',
			'Awaiting collection',
			'Payments awaiting follow-up',
			'Completed fulfilments'
		]) {
			await expect(metricsSection.getByText(label, { exact: true })).toBeVisible();
		}
		const cards = metricsSection.locator('.ui-stat-card');
		await expect(cards).toHaveCount(12);
		await expect(cards.locator('.ui-stat-card__value')).toHaveCount(12);
		for (const value of await cards.locator('.ui-stat-card__value').all())
			await expect(value).not.toHaveText('');
		const dateRange = page.getByRole('form', { name: 'Dashboard date range' });
		await expect(dateRange.locator('input[name="from"]')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
		await expect(dateRange.locator('input[name="to"]')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
		await expect(metricsSection.getByText(/recorded CRM evidence/i)).toBeVisible();

		await page.setViewportSize({ width: 390, height: 844 });
		const dimensions = await page.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth
		}));
		expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
	} finally {
		await cleanupUser(user.id);
	}
});
