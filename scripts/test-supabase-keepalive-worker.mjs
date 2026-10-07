import assert from 'node:assert/strict';

const workerUrl = new URL('../workers/supabase-keepalive/src/index.ts', import.meta.url);
let module;
try {
	module = await import(workerUrl.href);
} catch (error) {
	if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) {
		throw new Error('Keepalive scheduled handler is missing', { cause: error });
	}
	throw error;
}

const scheduled = module.default?.scheduled;
assert.equal(typeof scheduled, 'function', 'Worker must export a scheduled handler');
assert.deepEqual(
	Object.keys(module.default),
	['scheduled'],
	'Worker must not expose a public fetch handler'
);

const env = {
	SUPABASE_URL: 'https://project.example.supabase.co',
	SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
};
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalError = console.error;
const originalTimeout = AbortSignal.timeout;
const calls = [];
const logs = { info: [], error: [] };
const timeouts = [];

console.log = (...args) => logs.info.push(args.map(String).join(' '));
console.error = (...args) => logs.error.push(args.map(String).join(' '));
AbortSignal.timeout = (milliseconds) => {
	timeouts.push(milliseconds);
	return originalTimeout.call(AbortSignal, milliseconds);
};
try {
	globalThis.fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		return new Response('true', {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
	await scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {});
	assert.equal(calls.length, 1, 'Worker must make one database request');
	assert.equal(calls[0].url, `${env.SUPABASE_URL}/rest/v1/rpc/keepalive`);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.body, '{}');
	assert.deepEqual(timeouts, [10_000], 'database request must have a 10-second timeout');
	assert.ok(calls[0].init.signal, 'database request must use the timeout signal');
	const headers = new Headers(calls[0].init.headers);
	assert.equal(headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
	assert.equal(headers.get('content-type'), 'application/json');
	assert.equal(headers.get('authorization'), null, 'Worker must not send a service credential');
	assert.deepEqual(JSON.parse(logs.info[0]), {
		event: 'supabase_keepalive_succeeded',
		cron: '15 4 * * *',
		scheduledTime: '1970-01-01T00:00:00.000Z'
	});

	let failureCalls = 0;
	globalThis.fetch = async () => {
		failureCalls += 1;
		return new Response('false', { status: 200 });
	};
	await assert.rejects(
		() => scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {}),
		/unexpected response/
	);
	assert.equal(failureCalls, 1, 'Worker must not retry a failed database call');
	assert.equal(JSON.parse(logs.error.at(-1)).event, 'supabase_keepalive_failed');

	globalThis.fetch = async () => new Response('sensitive response payload', { status: 503 });
	await assert.rejects(
		() => scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {}),
		/HTTP 503/
	);
	const serializedLogs = JSON.stringify(logs);
	assert.equal(
		serializedLogs.includes(env.SUPABASE_PUBLISHABLE_KEY),
		false,
		'logs must not include the API key'
	);
	assert.equal(
		serializedLogs.includes('sensitive response payload'),
		false,
		'logs must not include the response payload'
	);

	const callsBeforeInvalidUrl = calls.length;
	await assert.rejects(
		() =>
			scheduled(
				{ cron: '15 4 * * *', scheduledTime: 0 },
				{ ...env, SUPABASE_URL: 'http://project.example.supabase.co' },
				{}
			),
		/HTTPS/
	);
	assert.equal(
		calls.length,
		callsBeforeInvalidUrl,
		'Worker must reject non-HTTPS URLs before making a request'
	);
} finally {
	globalThis.fetch = originalFetch;
	console.log = originalLog;
	console.error = originalError;
	AbortSignal.timeout = originalTimeout;
}

console.log('Supabase keepalive Worker checks passed');
