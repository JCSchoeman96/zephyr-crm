import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateCiWorkflow } from './check-ci-contract.mjs';
import { validateV140ReleaseEvidence } from './verify-v140-release-evidence.mjs';

const root = process.cwd();
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const runner = readFileSync('scripts/run-release-evidence.mjs', 'utf8');
const evidence = JSON.parse(readFileSync('docs/release/V1.4.0_RELEASE_EVIDENCE.json', 'utf8'));

assert.match(workflow, /v140-release:/, 'CI must define an explicit v1.4 release job.');
assert.match(
	workflow,
	/run: bun run release:evidence:v140:run/,
	'CI must execute the v1.4 release evidence runner.'
);
assert.match(
	workflow,
	/run: bun run release:evidence:v140:verify:complete/,
	'CI must verify generated v1.4 evidence at the release boundary.'
);
assert.match(
	workflow,
	/run: bun run test:p20:reconciliation:complete/,
	'CI must execute complete P20 reconciliation after evidence generation.'
);

for (const command of [
	'bun run authority:v140:verify',
	'bun run test:v140:review-hardening',
	'bun run test:p16:persistence',
	'bun run test:p17:sales-fulfilment',
	'bun run test:unit -- --run src/lib/domain/sales/queues.spec.ts',
	'bun run test:p18:sales-queues',
	'bun run test:p19:fulfilment',
	'bun run test:p19:browser',
	'bun run test:p20:metrics',
	'bun run test:p20:browser',
	'bun run test:p20:reconciliation'
]) {
	assert.match(
		runner,
		new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
		`${command} is not part of the v1.4 evidence run.`
	);
}

assert.equal(
	packageJson.scripts['release:evidence:v140:run'],
	'bun scripts/run-release-evidence.mjs --v140',
	'v1.4 evidence generation must use the shared release runner.'
);
assert.match(
	packageJson.scripts.quality,
	/release:evidence:v140:run/,
	'the aggregate quality gate must execute v1.4 evidence'
);
assert.match(
	packageJson.scripts['release:gate'],
	/release:evidence:v140:verify:complete.*test:p20:reconciliation:complete/,
	'the release gate must include complete v1.4 evidence and reconciliation'
);

const statusOnly = structuredClone(evidence);
statusOnly.phase_evidence = statusOnly.phase_evidence.map((entry, index) => ({
	...entry,
	status: index === 0 ? 'PASS' : 'PENDING'
}));
assert.throws(
	() => validateV140ReleaseEvidence(statusOnly, { root }),
	/execution output|recorded execution|execution/i,
	'a manually changed PASS must not satisfy v1.4 evidence verification.'
);

const executable = structuredClone(evidence);
const commands = [
	...new Set(executable.phase_evidence.map((entry) => entry.command)),
	'bun run test:p20:browser'
];
executable.phase_evidence = executable.phase_evidence.map((entry) => ({
	...entry,
	status: 'PASS'
}));
executable.execution = {
	runner: 'scripts/run-release-evidence.mjs --v140',
	git_sha: '0'.repeat(40),
	generated_at_utc: '2026-08-27T00:00:00.000Z',
	status: 'PASS',
	commands: commands.map((command) => ({
		command,
		status: 'PASS',
		exit_code: 0,
		output_sha256: 'a'.repeat(64),
		output_bytes: 1,
		output_excerpt: `${command} passed`
	}))
};
assert.doesNotThrow(
	() => validateV140ReleaseEvidence(executable, { root, requireComplete: true }),
	'generated v1.4 execution evidence should satisfy complete verification.'
);

validateCiWorkflow(workflow);
console.log('v1.4 CI/release evidence contract assertions passed');
