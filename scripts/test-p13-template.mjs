import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const { defaultClientConfiguration, parseClientConfiguration, parsePublicClientConfiguration } =
	await import('../src/lib/config/client-config.ts');
const exampleFile = 'config/client.example.json';
const tempDirectory = mkdtempSync(join(tmpdir(), 'zephyr-p13-'));
let databaseUrl = '';
let appProcess;
let browser;

function run(command, args, options = {}) {
	const { env: optionEnv, ...execOptions } = options;
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...execOptions,
			env: { ...process.env, ...(optionEnv ?? {}) }
		}).trim();
	} catch (error) {
		throw new Error(`${command} failed during the P13 template gate.`, { cause: error });
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function read(path) {
	return readFileSync(path, 'utf8');
}

function statusEnv() {
	const output = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		output
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function setting(key) {
	return JSON.parse(
		sql(`select setting_value::text from public.app_settings where setting_key = '${key}'`)
	);
}

function parseProvisionOutput(output) {
	return JSON.parse(output.split('\n').at(-1));
}

function provision(file, reset = false) {
	const runId = Date.now();
	const output = run('bun', ['run', 'client:provision', '--', file], {
		env: {
			PROVISION_OWNER_EMAIL: `p13-owner-${runId}@example.test`,
			PROVISION_OWNER_PASSWORD: `P13-local-${runId}-owner-password!`,
			CLIENT_PROVISION_RESET: reset ? 'true' : 'false'
		}
	});
	return parseProvisionOutput(output);
}

async function waitFor(url) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The local Vite server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function testBrandInBrowser(local) {
	const browserConfiguration = parsePublicClientConfiguration({
		version: defaultClientConfiguration.version,
		brand: {
			...defaultClientConfiguration.brand,
			companyName: 'P13 Browser Client',
			colors: { primary: '#5b21b6', primaryStrong: '#4c1d95', accent: '#0f766e' }
		},
		locale: defaultClientConfiguration.locale,
		quotes: defaultClientConfiguration.quotes
	});
	const serializedBrowserConfiguration = JSON.stringify(browserConfiguration);
	assert(
		!/SUPABASE|SENDPULSE|BRICKS|WEBHOOK|SECRET|ROLE|STATUS/i.test(serializedBrowserConfiguration),
		'Public client configuration contains a trusted name or secret reference.'
	);
	const appUrl = 'http://127.0.0.1:4182';
	appProcess = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4182'], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: local.API_URL,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY ?? local.PUBLISHABLE_KEY,
			PUBLIC_SITE_URL: appUrl,
			PUBLIC_CLIENT_CONFIG_JSON: JSON.stringify(browserConfiguration)
		}
	});
	await waitFor(`${appUrl}/system`);
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(`${appUrl}/system`, { waitUntil: 'networkidle' });
	await page.getByText('P13 Browser Client', { exact: true }).first().waitFor();
	const configuredColor = await page
		.locator('[data-testid="app-shell"]')
		.evaluate((element) =>
			getComputedStyle(element).getPropertyValue('--client-brand-primary').trim()
		);
	assert(configuredColor === '#5b21b6', 'Browser did not apply the configured client brand color.');
	console.log('P13-T03 brand-only browser configuration passed');
}

function testConfigurationContracts() {
	const configuration = parseClientConfiguration({
		...defaultClientConfiguration,
		brand: { ...defaultClientConfiguration.brand, companyName: 'Locale Quote Client' },
		locale: {
			...defaultClientConfiguration.locale,
			language: 'en-GB',
			currency: 'GBP',
			dateFormat: 'MM/dd/yyyy'
		},
		quotes: {
			...defaultClientConfiguration.quotes,
			prefix: 'GB-',
			taxLabel: 'GST',
			taxRate: 15,
			defaultValidityDays: 45,
			terms: 'Configured terms'
		}
	});
	assert(
		configuration.locale.currency === 'GBP',
		'Locale currency did not come from configuration.'
	);
	assert(configuration.quotes.prefix === 'GB-', 'Quote prefix did not come from configuration.');
	assert(configuration.quotes.taxRate === 15, 'Quote tax rate did not come from configuration.');
	assert(
		configuration.quotes.defaultValidityDays === 45,
		'Quote validity did not come from configuration.'
	);
	console.log('P13-T04 locale and quote configuration passed');
}

function testIntegrationContracts() {
	const one = parseClientConfiguration({
		...defaultClientConfiguration,
		integrations: {
			...defaultClientConfiguration.integrations,
			bricks: { ...defaultClientConfiguration.integrations.bricks, formId: 'client-one-form' },
			sendpulse: {
				...defaultClientConfiguration.integrations.sendpulse,
				senderDomain: 'client-one.test',
				templateIds: { quote: 'client-one-quote' }
			}
		}
	});
	const two = parseClientConfiguration({
		...defaultClientConfiguration,
		integrations: {
			...defaultClientConfiguration.integrations,
			bricks: { ...defaultClientConfiguration.integrations.bricks, formId: 'client-two-form' },
			sendpulse: {
				...defaultClientConfiguration.integrations.sendpulse,
				senderDomain: 'client-two.test',
				templateIds: { quote: 'client-two-quote' }
			}
		}
	});
	assert(
		one.integrations.bricks.formId !== two.integrations.bricks.formId,
		'Bricks identifiers are not client-configurable.'
	);
	assert(
		one.integrations.sendpulse.senderDomain !== two.integrations.sendpulse.senderDomain,
		'SendPulse identifiers are not client-configurable.'
	);
	const approved = parseClientConfiguration(JSON.parse(read(exampleFile)));
	assert(
		approved.integrations.sendpulse.clientSecretEnvKey === 'SENDPULSE_CLIENT_SECRET',
		'SendPulse secret boundary is not trusted-environment based.'
	);
	assert(
		read('src/lib/server/client-config.ts').includes('CLIENT_CONFIG_JSON'),
		'Trusted client config loader is missing.'
	);
	assert(
		!read('src/lib/domain/communications/sendpulse-adapter.ts').includes('client-one-form'),
		'Client-specific integration leaked into core code.'
	);
	console.log('P13-T05 Bricks/SendPulse configuration boundary passed');
}

function testStaticBoundaries() {
	const tracked = run('git', ['ls-files']).split('\n').filter(Boolean);
	assert(
		!tracked.some((file) => file === '.env' || file === '.dev.vars' || file.endsWith('.pem')),
		'A trusted secret file is tracked.'
	);
	const clientForkMarkers = ['Client' + 'A', 'Client' + 'B'];
	const branches = run('git', ['branch', '--format=%(refname:short)']);
	assert(
		!clientForkMarkers.some((marker) => branches.includes(marker)),
		'A permanent client-specific branch exists.'
	);
	const source = tracked
		.filter((file) => /^(src|scripts|config|supabase)\//.test(file))
		.map(read)
		.join('\n');
	assert(
		!clientForkMarkers.some((marker) => source.includes(marker)),
		'A client fork marker exists in implementation source.'
	);
	assert(
		!read(exampleFile).includes('"clientSecret"'),
		'A client secret value key exists in the source-controlled example.'
	);
	console.log('P13-T06 no-client-fork and P13-T07 secret-isolation static checks passed');
}

function testDocumentation() {
	const documentation = read('docs/CLIENT_DEPLOYMENT.md');
	for (const phrase of [
		'one isolated stack per client',
		'Offboarding dry run',
		'client-owned',
		'DNS',
		'SendPulse',
		'not claimed'
	]) {
		assert(documentation.includes(phrase), `Client deployment documentation is missing: ${phrase}`);
	}
	console.log('P13-T08 offboarding and P13-T11 external-step documentation passed');
}

async function main() {
	run('bun', ['run', 'db:reset']);
	const local = statusEnv();
	databaseUrl = local.DB_URL;
	assert(
		local.API_URL && local.SERVICE_ROLE_KEY && databaseUrl,
		'Local Supabase is not ready for P13.'
	);

	const provisioned = provision(exampleFile, false);
	assert(
		provisioned.status === 'PROVISIONED_LOCAL',
		'Fresh local provisioning did not return success.'
	);
	assert(
		setting('owner_user').provisioning === 'local-template',
		'Fresh provisioning did not seed the Owner contract.'
	);
	assert(
		setting('quote_defaults').prefix === 'Q-',
		'Fresh provisioning did not seed quote defaults.'
	);
	console.log('P13-T01 fresh local Supabase provisioning passed');

	run('bun', ['run', 'build']);
	const wrangler = read('wrangler.jsonc');
	assert(
		wrangler.includes('"main"') &&
			wrangler.includes('"assets"') &&
			wrangler.includes('"binding": "ASSETS"') &&
			existsSync('.svelte-kit/cloudflare/_worker.js'),
		'Cloudflare Workers + Static Assets artifact is missing.'
	);
	console.log('P13-T02 local Cloudflare Workers + Static Assets production artifact passed');

	await testBrandInBrowser(local);
	testConfigurationContracts();
	testIntegrationContracts();
	testStaticBoundaries();
	testDocumentation();

	sql(
		"insert into public.lead_sources (code, label, sort_order) values ('p13_upgrade_marker', 'P13 upgrade marker', 999) on conflict (code) do update set label = excluded.label;"
	);
	const upgradeConfiguration = {
		...defaultClientConfiguration,
		brand: { ...defaultClientConfiguration.brand, companyName: 'P13 Upgrade Client' },
		quotes: { ...defaultClientConfiguration.quotes, prefix: 'UP-' }
	};
	const upgradeFile = join(tempDirectory, 'upgrade.json');
	writeFileSync(upgradeFile, JSON.stringify(upgradeConfiguration, null, 2));
	const upgraded = provision(upgradeFile, false);
	assert(upgraded.status === 'PROVISIONED_LOCAL', 'Upgrade provisioning did not return success.');
	assert(
		setting('company_identity').name === 'P13 Upgrade Client',
		'Upgrade did not retain the new client configuration.'
	);
	assert(
		setting('quote_defaults').prefix === 'UP-',
		'Upgrade did not update the quote configuration.'
	);
	assert(
		sql("select count(*) from public.lead_sources where code = 'p13_upgrade_marker'") === '1',
		'Upgrade lost existing local data.'
	);
	run('bunx', ['supabase', 'migration', 'list', '--local']);
	console.log('P13-T09 upgrade rehearsal retained configuration and data');

	run('bun', ['run', 'client:validate', '--', exampleFile]);
	run('bun', ['run', 'format:check']);
	run('bun', ['run', 'lint']);
	run('bun', ['run', 'check']);
	run('bun', ['run', 'test:unit', '--', '--run']);
	run('bun', ['run', 'build']);
	run('bun', ['run', 'security:bundle']);
	run('bun', ['run', 'db:test']);
	run('bun', ['run', 'diff:check']);
	console.log(
		'P13-T10 fresh-template quality subset passed; full bun run quality remains the project gate'
	);
}

try {
	await main();
} finally {
	if (browser) await browser.close().catch(() => undefined);
	if (appProcess) appProcess.kill('SIGTERM');
	if (databaseUrl) sql("delete from public.lead_sources where code = 'p13_upgrade_marker';");
	rmSync(tempDirectory, { recursive: true, force: true });
}
