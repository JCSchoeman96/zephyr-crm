import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePublicEnv, trustedEnvironmentKeys } from './env';

describe('environment contract', () => {
	it('accepts only the required browser-safe variables', () => {
		expect(
			parsePublicEnv({
				PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
				PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
				PUBLIC_SITE_URL: 'http://127.0.0.1:5173'
			})
		).toEqual({
			supabaseUrl: 'http://127.0.0.1:54321',
			supabasePublishableKey: 'local-publishable-key',
			siteUrl: 'http://127.0.0.1:5173'
		});
	});

	it('rejects a missing public variable', () => {
		expect(() =>
			parsePublicEnv({
				PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
				PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key'
			})
		).toThrow('Missing required public environment variable: PUBLIC_SITE_URL');
	});

	it('keeps trusted variables out of the browser contract', () => {
		expect(trustedEnvironmentKeys).toEqual([
			'SUPABASE_URL',
			'SUPABASE_SERVICE_ROLE_KEY',
			'SENDPULSE_CLIENT_ID',
			'SENDPULSE_CLIENT_SECRET',
			'SENDPULSE_API_BASE_URL',
			'SENDPULSE_SENDER_EMAIL',
			'SENDPULSE_SENDER_NAME',
			'SENDPULSE_WEBHOOK_SECRET',
			'SENDPULSE_SENDER_DOMAIN',
			'SENDPULSE_DKIM_SELECTOR',
			'SENDPULSE_SPF_RECORD',
			'SENDPULSE_DKIM_RECORD',
			'SENDPULSE_DMARC_RECORD',
			'SENDPULSE_DOMAIN_AUTHENTICATED',
			'AUTOMATION_CRON_SECRET',
			'BRICKS_FORM_ID',
			'BRICKS_WEBHOOK_SECRET'
		]);
	});

	it('keeps the public bundle scanner aligned with every trusted environment key', () => {
		const scanner = readFileSync(
			new URL('../../../scripts/check-public-bundle.mjs', import.meta.url),
			'utf8'
		);

		for (const key of trustedEnvironmentKeys) {
			expect(scanner).toContain(`'${key}'`);
		}
	});
});
