import { expect, test } from '@playwright/test';
import { cleanupUser, createStaff, signIn } from './helpers';

test.describe('P14 navigation and capability truth', () => {
	test('every visible role navigation link resolves to a current capability', async ({
		browser
	}) => {
		const roles = ['sales', 'viewer', 'owner'] as const;
		const users = await Promise.all(roles.map((role) => createStaff(role, `navigation-${role}`)));
		try {
			for (const [index, role] of roles.entries()) {
				const context = await browser.newContext();
				const page = await context.newPage();
				try {
					await signIn(page, users[index]);
					await page.goto('/', { waitUntil: 'networkidle' });
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
						const response = await page.goto(href, { waitUntil: 'networkidle' });
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

	test('keeps Sales navigation in workflow order with registers clearly placed', async ({
		page
	}) => {
		test.setTimeout(90_000);
		const user = await createStaff('sales', 'navigation-order');
		try {
			await signIn(page, user);
			await page.goto('/', { waitUntil: 'networkidle' });

			const salesLinks = await page
				.getByRole('navigation', { name: 'Primary navigation' })
				.getByRole('link')
				.evaluateAll((anchors) => {
					const salesPaths = new Set([
						'/leads',
						'/sales/enquiries',
						'/sales/qualification',
						'/sales/proposals',
						'/sales/decisions',
						'/quotes'
					]);
					return anchors
						.map((anchor) => {
							const element = anchor as HTMLAnchorElement;
							return {
								path: new URL(element.href).pathname,
								label: element.textContent?.trim() ?? ''
							};
						})
						.filter(({ path }) => salesPaths.has(path));
				});

			expect(salesLinks).toEqual([
				{ path: '/leads', label: 'All enquiries' },
				{ path: '/sales/enquiries', label: 'New Enquiries' },
				{ path: '/sales/qualification', label: 'Qualification' },
				{ path: '/sales/proposals', label: 'Quotes to Prepare' },
				{ path: '/sales/decisions', label: 'Awaiting Feedback' },
				{ path: '/quotes', label: 'Quotes' }
			]);
		} finally {
			await cleanupUser(user.id);
		}
	});

	test('disabled Component Lab is a 404 boundary', async ({ page }) => {
		if (process.env.ZEPHYR_COMPONENT_LAB_ENABLED !== '0') test.skip();
		const response = await page.goto('/system', { waitUntil: 'networkidle' });
		expect(response?.status()).toBe(404);
	});
});
