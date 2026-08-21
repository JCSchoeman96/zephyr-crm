import { expect, test } from '@playwright/test';

test('invitation-only authentication exposes a labelled sign-in form', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in to Zephyr CRM' })).toBeVisible();
	await expect(page.getByLabel('Email address')).toBeVisible();
	await expect(page.getByLabel('Password')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
	await expect(page.getByRole('link', { name: /create account|sign up/i })).toHaveCount(0);
});
