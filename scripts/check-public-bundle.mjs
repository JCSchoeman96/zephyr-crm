import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outputRoots = ['.svelte-kit/output/client', '.svelte-kit/cloudflare', 'build'];
const trustedEnvironmentKeys = [
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
];
const privateConfigurationKeys = ['CLIENT_CONFIG_JSON'];
const forbiddenNames = [...trustedEnvironmentKeys, ...privateConfigurationKeys];
const forbiddenValueKeys = [
	'SUPABASE_SERVICE_ROLE_KEY',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_WEBHOOK_SECRET',
	'AUTOMATION_CRON_SECRET',
	'BRICKS_WEBHOOK_SECRET',
	'CLIENT_CONFIG_JSON'
];

function exactNamePattern(name) {
	return new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`);
}

const forbiddenPatterns = forbiddenNames.map((name) => ({ name, pattern: exactNamePattern(name) }));
const forbiddenValues = forbiddenValueKeys
	.map((name) => ({ name, value: process.env[name]?.trim() }))
	.filter(({ value }) => value);

function filesUnder(directory) {
	if (!existsSync(directory)) return [];

	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

const outputFiles = outputRoots.flatMap(filesUnder);
const violations = outputFiles.flatMap((file) => {
	const contents = readFileSync(file, 'utf8');
	const nameViolations = forbiddenPatterns
		.filter(({ pattern }) => pattern.test(contents))
		.map(({ name }) => `${file}: ${name}`);
	const valueViolations = forbiddenValues
		.filter(({ value }) => contents.includes(value))
		.map(({ name }) => `${file}: value for ${name}`);
	return [...nameViolations, ...valueViolations];
});

if (violations.length > 0) {
	console.error('Trusted environment names found in a public build:');
	console.error(violations.join('\n'));
	process.exit(1);
}

console.log(`Public bundle secret scan passed (${outputFiles.length} files inspected).`);
