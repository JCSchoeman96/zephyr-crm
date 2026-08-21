import { describe, expect, it } from 'vitest';
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
			'SUPABASE_SERVICE_ROLE_KEY',
			'SENDPULSE_CLIENT_ID',
			'SENDPULSE_CLIENT_SECRET',
			'BRICKS_WEBHOOK_SECRET'
		]);
	});
});
