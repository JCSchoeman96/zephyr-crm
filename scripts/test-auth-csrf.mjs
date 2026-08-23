import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = process.cwd();
const port = 4185;
const appUrl = `http://127.0.0.1:${port}`;
let worker;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function waitForWorker() {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			const response = await fetch(`${appUrl}/login`);
			if (response.status < 500) return;
		} catch {
			// Wrangler is still starting the local production Worker.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('Timed out waiting for the local production Worker.');
}

async function stopWorker() {
	if (!worker || worker.exitCode !== null) return;
	const process = worker;
	await new Promise((resolve) => {
		const timeout = setTimeout(() => {
			process.kill('SIGKILL');
			resolve();
		}, 5000);
		process.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});
		process.kill('SIGTERM');
	});
	worker = undefined;
}

try {
	assert(
		existsSync('.svelte-kit/cloudflare/_worker.js'),
		'Production Worker artifact is missing; run bun run build first.'
	);
	worker = spawn(
		'bunx',
		['wrangler', 'dev', '--local', '--port', String(port), '--show-interactive-dev-session=false'],
		{
			cwd: root,
			stdio: ['ignore', 'ignore', 'pipe'],
			env: { ...process.env, PUBLIC_SITE_URL: appUrl }
		}
	);
	await waitForWorker();

	const crossOrigin = await fetch(`${appUrl}/login`, {
		method: 'POST',
		headers: {
			origin: 'https://cross-origin.example',
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({ email: 'not-used@example.test', password: 'not-used' })
	});
	assert(
		crossOrigin.status === 403,
		`production Worker accepted a cross-origin form mutation (HTTP ${crossOrigin.status})`
	);
	console.log('Auth CSRF contract passed: production Worker rejects cross-origin form mutations.');
} finally {
	await stopWorker();
}
