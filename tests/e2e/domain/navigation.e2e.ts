import { expect, test } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

test.describe('P14 navigation and capability truth', () => {
	test('every visible role navigation link resolves to a current capability', async ({
		browser
	}) => {
		test.setTimeout(60_000);
		const roles = ['sales', 'viewer', 'owner'] as const;
		const users = await Promise.all(roles.map((role) => createStaff(role, `navigation-${role}`)));
		try {
			for (const [index, role] of roles.entries()) {
				const context = await browser.newContext();
				const page = await context.newPage();
				try {
					await signIn(page, users[index]);
					await page.goto('/', { waitUntil: 'domcontentloaded' });
					const links = await page
						.getByRole('navigation', { name: 'Primary navigation' })
						.getByRole('link')
						.evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
					expect(links.some((href) => href.endsWith('/reports'))).toBe(false);
					expect(links.some((href) => href.endsWith('/settings'))).toBe(false);
					if (role !== 'owner') {
						expect(links.some((href) => href.endsWith('/operations'))).toBe(false);
					}
					for (const href of links) {
						const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
						expect(response?.status(), `${role} navigation ${href}`).toBe(200);
					}
				} finally {
					await context.close();
				}
			}
		} finally {
			await Promise.all(users.map((user) => cleanupUser(user.id)));
		}
	});

	test('disabled Component Lab is a 404 boundary', async ({ page }) => {
		if (process.env.ZEPHYR_COMPONENT_LAB_ENABLED !== '0') test.skip();
		const response = await page.goto('/system', { waitUntil: 'networkidle' });
		expect(response?.status()).toBe(404);
	});
});
