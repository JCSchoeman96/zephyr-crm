import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outputRoots = ['.svelte-kit/output/client', '.svelte-kit/cloudflare', 'build'];
const forbiddenNames = [
	'SUPABASE_URL',
	'SUPABASE_SERVICE_ROLE_KEY',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_API_BASE_URL',
	'SENDPULSE_SENDER_EMAIL',
	'SENDPULSE_SENDER_NAME',
	'BRICKS_FORM_ID',
	'BRICKS_WEBHOOK_SECRET'
];

function exactNamePattern(name) {
	return new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`);
}

const forbiddenPatterns = forbiddenNames.map((name) => ({ name, pattern: exactNamePattern(name) }));

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
	return forbiddenPatterns
		.filter(({ pattern }) => pattern.test(contents))
		.map(({ name }) => `${file}: ${name}`);
});

if (violations.length > 0) {
	console.error('Trusted environment names found in a public build:');
	console.error(violations.join('\n'));
	process.exit(1);
}

console.log(`Public bundle secret scan passed (${outputFiles.length} files inspected).`);
