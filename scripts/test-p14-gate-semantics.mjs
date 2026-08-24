import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const releaseScript = readFileSync('scripts/test-p14-release.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

assert(!releaseScript.includes("['run', 'quality']"), 'P14 release proof must not invoke quality.');
assert(
	!releaseScript.includes('bun run quality'),
	'P14 release proof must not recurse through quality.'
);
assert(packageJson.scripts.quality && !packageJson.scripts.quality.includes('test:p14:release'));
assert.match(packageJson.scripts['release:gate'], /bun run quality/);
assert.match(packageJson.scripts['release:gate'], /bun run test:p14:release/);
assert.match(packageJson.scripts['release:gate'], /bun run release:state(\s|&&)/);
assert.match(workflow, /browser-domain-e2e:/);
assert.match(workflow, /release-contract:[\s\S]*needs: \[[^\]]*browser-domain-e2e/);
for (const script of [
	'test:p14:browser-harness',
	'test:p14:won-flow',
	'test:p14:lost-flow',
	'test:p14:client-integrity',
	'test:p14:contact-integrity',
	'test:p14:task-integrity',
	'test:p14:document-fitness',
	'test:p14:email-safety',
	'test:p14:navigation',
	'test:p14:product-flow',
	'test:p14:hardening-reconciliation',
	'test:p14:mutation-parity'
]) {
	assert.equal(
		typeof packageJson.scripts[script],
		'string',
		`${script} is not a real package command.`
	);
	assert(releaseScript.includes(`'${script}'`), `${script} is not invoked by the P14 gate.`);
}
console.log('P14-T23 P14 gate semantic integrity passed');
