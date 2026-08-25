import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const releaseScript = readFileSync('scripts/test-p14-release.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');
const previewScript = readFileSync('scripts/test-p14-preview.mjs', 'utf8');
const browserHelpers = readFileSync('tests/e2e/domain/helpers.ts', 'utf8');
const quoteActions = readFileSync('src/lib/server/quote-actions.ts', 'utf8');
const readinessState = readFileSync('docs/release/P14_READINESS_STATE.json', 'utf8');

assert(!releaseScript.includes("['run', 'quality']"), 'P14 release proof must not invoke quality.');
assert(
	!releaseScript.includes('bun run quality'),
	'P14 release proof must not recurse through quality.'
);
assert(packageJson.scripts.quality && !packageJson.scripts.quality.includes('test:p14:release'));
assert.match(packageJson.scripts['release:gate'], /bun run quality/);
assert.match(packageJson.scripts['release:gate'], /bun run test:p14:release/);
assert.match(packageJson.scripts['release:gate'], /bun run release:state(\s|&&)/);
assert.equal(
	packageJson.scripts['test:e2e:smoke'],
	'playwright test tests/e2e/auth.e2e.ts tests/e2e/design-system.e2e.ts tests/e2e/scaffold.e2e.ts'
);
assert.equal(packageJson.scripts['test:e2e:domain'], 'playwright test tests/e2e/domain');
assert.match(
	packageJson.scripts['test:p14:browser-harness'],
	/playwright test tests\/e2e\/domain\/stateful-harness\.e2e\.ts$/
);
assert.match(
	packageJson.scripts['test:p14:won-flow'],
	/playwright test tests\/e2e\/domain\/won-flow\.e2e\.ts$/
);
assert.match(
	packageJson.scripts['test:p14:lost-flow'],
	/playwright test tests\/e2e\/domain\/lost-flow\.e2e\.ts$/
);
assert.match(
	packageJson.scripts['test:p14:product-flow'],
	/playwright test tests\/e2e\/domain\/product-flow\.e2e\.ts tests\/e2e\/domain\/role-accessibility\.e2e\.ts$/
);
assert.match(workflow, /browser-domain-e2e:/);
assert.match(workflow, /release-contract:[\s\S]*needs: \[[^\]]*browser-domain-e2e/);
assert.match(playwrightConfig, /env: appEnvironment/);
assert.doesNotMatch(playwrightConfig, /previewVariables|--var/);
assert.match(playwrightConfig, /scripts\/test-p14-preview\.mjs/);
assert.match(previewScript, /mkdtempSync/);
assert.match(previewScript, /--env-file/);
assert.doesNotMatch(previewScript, /--var/);
assert.match(releaseScript, /docs\/release\/P14_READINESS_STATE\.json/);
assert.match(releaseScript, /existsSync/);
assert.match(readinessState, /"execution_stage": "COMPLETE"/);
assert.match(browserHelpers, /staffSequence/);
assert.match(browserHelpers, /staffSequence\s*\+=\s*1|\+\+staffSequence/);
assert(
	quoteActions.indexOf('buildQuoteEmail(') < quoteActions.indexOf("rpc('prepare_quote_send'"),
	'Quote email/configuration validation must happen before the outbound claim.'
);
assert(
	quoteActions.indexOf('A configured SendPulse sender email and name are required.') <
		quoteActions.indexOf("rpc('prepare_quote_send'"),
	'SendPulse sender configuration must be validated before the outbound claim.'
);
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
