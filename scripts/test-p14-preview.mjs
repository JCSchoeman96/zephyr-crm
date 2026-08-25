import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const previewDirectory = mkdtempSync(join(tmpdir(), 'zephyr-p14-preview-'));
const envFile = join(previewDirectory, 'worker.env');
const bindingNames = [
	'ZEPHYR_COMPONENT_LAB_ENABLED',
	'BRICKS_WEBHOOK_SECRET',
	'BRICKS_FORM_ID',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_API_BASE_URL',
	'SENDPULSE_SENDER_EMAIL',
	'SENDPULSE_SENDER_NAME',
	'SENDPULSE_WEBHOOK_SECRET',
	'PUBLIC_SITE_URL',
	'PUBLIC_SUPABASE_URL',
	'SUPABASE_URL',
	'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
	'SUPABASE_SERVICE_ROLE_KEY'
];

writeFileSync(
	envFile,
	bindingNames.map((name) => `${name}=${process.env[name] ?? ''}`).join('\n') + '\n',
	{ mode: 0o600 }
);
chmodSync(envFile, 0o600);

let activeChild;
let finished = false;

function cleanup() {
	if (finished) return;
	finished = true;
	rmSync(previewDirectory, { recursive: true, force: true });
}

function stop(signal) {
	activeChild?.kill(signal);
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('exit', cleanup);

const build = spawn('bun', ['run', 'build'], { stdio: 'inherit', env: process.env });
activeChild = build;
build.once('exit', (buildCode, buildSignal) => {
	if (buildCode !== 0 || buildSignal) {
		cleanup();
		process.exitCode = buildCode ?? 1;
		return;
	}
	const preview = spawn('wrangler', ['dev', '--local', '--port', '4173', '--env-file', envFile], {
		stdio: 'inherit',
		env: process.env
	});
	activeChild = preview;
	preview.once('exit', (previewCode, previewSignal) => {
		cleanup();
		process.exitCode = previewSignal ? 1 : (previewCode ?? 1);
	});
});
