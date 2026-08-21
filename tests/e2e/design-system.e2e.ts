import { expect, test } from '@playwright/test';

test.describe('design system and application shell', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/system');
	});

	test('renders primitive states and labelled controls', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Component Lab' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Primary button' })).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Disabled button' })).toBeDisabled();
		await expect(page.getByLabel('Name')).toBeVisible();
		await expect(page.getByLabel('Description')).toBeVisible();
		await expect(page.getByLabel('Category')).toBeVisible();
		await expect(page.getByLabel('Accept terms')).toBeVisible();
		await expect(page.getByRole('alert')).toContainText('Example error');
		await expect(page.getByRole('status')).toContainText('Loading');
	});

	test('renders and closes modal and drawer primitives', async ({ page }) => {
		await page.getByRole('button', { name: 'Open sample modal' }).click();
		await expect(page.getByRole('dialog', { name: 'Sample modal' })).toBeVisible();
		await page.getByRole('button', { name: 'Close dialog' }).click();
		await expect(page.getByRole('dialog', { name: 'Sample modal' })).toBeHidden();

		await page.getByRole('button', { name: 'Open sample drawer' }).click();
		await expect(page.getByRole('dialog', { name: 'Sample drawer' })).toBeVisible();
		await page.getByRole('button', { name: 'Close drawer' }).click();
		await expect(page.getByRole('dialog', { name: 'Sample drawer' })).toBeHidden();
	});

	test('supports keyboard navigation and mobile navigation', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.reload();
		await page.getByRole('button', { name: 'Open navigation' }).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
		await page.getByRole('link', { name: 'Dashboard' }).focus();
		await expect(page.getByRole('link', { name: 'Dashboard' })).toBeFocused();
	});

	test('keeps shell within the viewport at mobile, tablet, and desktop widths', async ({
		page
	}) => {
		for (const viewport of [
			{ width: 390, height: 844 },
			{ width: 768, height: 1024 },
			{ width: 1280, height: 900 }
		]) {
			await page.setViewportSize(viewport);
			await page.reload();
			const dimensions = await page.evaluate(() => ({
				viewport: window.innerWidth,
				document: document.documentElement.scrollWidth
			}));
			expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
		}
	});

	test('changes brand tokens without changing primitive source', async ({ page }) => {
		const marker = page.getByTestId('brand-marker');
		const initialColour = await marker.evaluate(
			(element) => getComputedStyle(element).backgroundColor
		);
		await page.getByRole('button', { name: 'Use alternate brand' }).click();
		await expect(marker).toHaveAttribute('data-brand', 'alternate');
		const alternateColour = await marker.evaluate(
			(element) => getComputedStyle(element).backgroundColor
		);
		expect(alternateColour).not.toBe(initialColour);
	});
});
