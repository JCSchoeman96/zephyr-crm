import { execFileSync } from 'node:child_process';

function run(command, args) {
	try {
		return execFileSync(command, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, NO_COLOR: '1' }
		}).trim();
	} catch {
		throw new Error(`${command} ${args.join(' ')} failed during the P1 lifecycle proof.`);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

let lifecycleError;
try {
	run('bun', ['run', 'db:start']);
	run('bun', ['run', 'db:reset']);
	const status = run('bunx', ['supabase', 'status', '-o', 'env']);
	assert(status.includes('API_URL='), 'Local Supabase status did not expose API_URL after reset.');
	assert(status.includes('DB_URL='), 'Local Supabase status did not expose DB_URL after reset.');
} catch (error) {
	lifecycleError = error;
} finally {
	try {
		run('bun', ['run', 'db:stop']);
	} catch (error) {
		if (!lifecycleError) lifecycleError = error;
	}
}

if (lifecycleError) throw lifecycleError;
console.log('P1-T05 Supabase start/reset/stop lifecycle passed with guaranteed cleanup.');
