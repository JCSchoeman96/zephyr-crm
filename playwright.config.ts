import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';

function localSupabaseEnvironment(): Record<string, string> {
	try {
		const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		return Object.fromEntries(
			output
				.split('\n')
				.filter((line) => line.includes('='))
				.map((line) => {
					const separator = line.indexOf('=');
					return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
				})
		);
	} catch {
		return {};
	}
}

const local = localSupabaseEnvironment();
const localApiUrl = process.env.SUPABASE_URL ?? local.API_URL;
const localAnonKey =
	process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const localServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? local.SERVICE_ROLE_KEY;
const appEnvironment: Record<string, string> = {
	ZEPHYR_COMPONENT_LAB_ENABLED: process.env.ZEPHYR_COMPONENT_LAB_ENABLED ?? '1',
	BRICKS_WEBHOOK_SECRET: 'p14-browser-bricks-secret',
	BRICKS_FORM_ID: 'contact-form',
	SENDPULSE_CLIENT_ID: 'p14-browser-client',
	SENDPULSE_CLIENT_SECRET: 'p14-browser-secret',
	SENDPULSE_API_BASE_URL: 'http://127.0.0.1:4180',
	SENDPULSE_SENDER_EMAIL: 'sales@p14.example.test',
	SENDPULSE_SENDER_NAME: 'P14 Example Sales',
	SENDPULSE_WEBHOOK_SECRET: 'p14-browser-sendpulse-secret',
	PUBLIC_SITE_URL: 'http://127.0.0.1:4173'
};
if (localApiUrl) {
	appEnvironment.PUBLIC_SUPABASE_URL = localApiUrl;
	appEnvironment.SUPABASE_URL = localApiUrl;
}
if (localAnonKey) appEnvironment.PUBLIC_SUPABASE_PUBLISHABLE_KEY = localAnonKey;
if (localServiceRoleKey) appEnvironment.SUPABASE_SERVICE_ROLE_KEY = localServiceRoleKey;

export default defineConfig({
	webServer: [
		{
			command: 'bun scripts/test-p14-sendpulse-fixture.mjs',
			port: 4180,
			reuseExistingServer: false
		},
		{
			command: 'bun scripts/test-p14-preview.mjs',
			port: 4173,
			env: appEnvironment,
			reuseExistingServer: false
		}
	],
	testMatch: '**/*.e2e.{ts,js}',
	use: { baseURL: 'http://127.0.0.1:4173' }
});
