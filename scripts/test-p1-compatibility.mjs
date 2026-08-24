import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const lockfile = resolve(root, 'bun.lock');

const compatibilitySteps = [
	['start local Supabase', ['db:start']],
	['reset local Supabase from canonical migrations and seed', ['db:reset']],
	['toolchain contract', ['test:p1:toolchain']],
	['format check', ['format:check']],
	['lint', ['lint']],
	['Svelte and TypeScript check', ['check']],
	['baseline Vitest', ['test:unit', '--', '--run']],
	['Playwright smoke', ['test:e2e:smoke']],
	['production Worker build', ['build']],
	['public-bundle secret scan', ['security:bundle']],
	['database lint', ['db:test']],
	['database security contract', ['db:security']]
];

function lockfileHash() {
	return createHash('sha256').update(readFileSync(lockfile)).digest('hex');
}

function run(args) {
	try {
		return execFileSync('bun', ['run', ...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 32 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: '1' }
		}).trim();
	} catch {
		throw new Error(`P1 compatibility step failed: bun run ${args.join(' ')}`);
	}
}

const initialLockfileHash = lockfileHash();
let compatibilityError;

try {
	for (const [label, args] of compatibilitySteps) {
		run(args);
		console.log(`P1 compatibility step passed: ${label}`);
	}
} catch (error) {
	compatibilityError = error;
} finally {
	try {
		run(['db:stop']);
		console.log('P1 compatibility cleanup passed: local Supabase stopped');
	} catch (error) {
		if (!compatibilityError) compatibilityError = error;
	}
}

if (lockfileHash() !== initialLockfileHash) {
	compatibilityError ??= new Error('P1 compatibility gate changed bun.lock unexpectedly.');
}

if (compatibilityError) throw compatibilityError;

console.log('P1 compatibility gate passed; bun.lock remained unchanged.');
