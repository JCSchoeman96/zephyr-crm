import { readFileSync } from 'node:fs';

const workflowPath = '.github/workflows/ci.yml';
const requiredCommands = [
	'bun install --frozen-lockfile',
	'bun run authority:registry',
	'bun run authority:coverage',
	'bun run authority:verify',
	'bun run ci:contract',
	'bun run release:evidence:verify',
	'bun run release:manifest:verify',
	'bun run test:release:contract',
	'bun run format:check',
	'bun run lint',
	'bun run check',
	'bun run test:unit -- --run',
	'bun run test:db-types',
	'bun run tokens:check',
	'bun run test:e2e:install',
	'bun run test:e2e',
	'bun run build',
	'bun run auth:csrf',
	'bun run security:bundle',
	'bun run db:start',
	'bun run db:reset',
	'bun run db:test',
	'bun run db:types:check',
	'bun run db:security',
	'bun run test:v131:security',
	'bun run test:v131:communications',
	'bun run test:v131:recovery',
	'bun run auth:integration',
	'bun run auth:readiness',
	'bun run test:p4:domain',
	'bun run test:p4:tracer',
	'bun run test:p5:leads',
	'bun run test:p6:clients',
	'bun run test:p7:quotes',
	'bun run test:p8:documents',
	'bun run test:p9:automation',
	'bun run test:p10:analytics',
	'bun run test:p11:hardening',
	'bun run test:p12:hardening',
	'bun run test:p13:template',
	'bun run diff:check'
];

function fail(message) {
	throw new Error(`CI contract: ${message}`);
}

export function validateCiWorkflow(workflow) {
	if (!workflow.includes('permissions:\n  contents: read')) {
		fail('workflow permissions must remain contents: read only');
	}
	for (const command of requiredCommands) {
		if (!workflow.includes(`run: ${command}`)) fail(`missing required command ${command}`);
	}
	if (workflow.includes('run: bun run quality')) {
		fail('workflow must enumerate gates instead of calling the aggregate quality loop');
	}
	if (!workflow.includes('if: always()') || !workflow.includes('bun run db:stop')) {
		fail('Supabase cleanup must run with if: always()');
	}
	const jobTimeouts = workflow.match(/^\s+timeout-minutes:\s+\d+\s*$/gm) ?? [];
	if (jobTimeouts.length < 3)
		fail('static, database, and browser/release jobs need explicit timeouts');
	const unpinnedActions = [...workflow.matchAll(/^\s+- uses:\s+([^\s]+)$/gm)]
		.map((match) => match[1])
		.filter((reference) => !/@[0-9a-f]{40}$/.test(reference));
	if (unpinnedActions.length > 0) {
		fail(`third-party actions must use immutable commit SHAs: ${unpinnedActions.join(', ')}`);
	}
	return true;
}

if (process.argv[1] && process.argv[1].endsWith('check-ci-contract.mjs')) {
	validateCiWorkflow(readFileSync(workflowPath, 'utf8'));
	console.log(
		`CI contract passed: ${requiredCommands.length} required commands and immutable actions.`
	);
}
