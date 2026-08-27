import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateEvidenceRegistry } from './verify-test-evidence.mjs';

const root = process.cwd();

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 32 * 1024 * 1024,
		...options
	}).trim();
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function read(path) {
	return readFileSync(join(root, path), 'utf8');
}

function releaseStatePath() {
	const localStatePath = '.agent/goal-loop/STATE.json';
	return existsSync(join(root, localStatePath))
		? localStatePath
		: 'docs/release/P14_READINESS_STATE.json';
}

function provisionFreshClient() {
	const runId = Date.now();
	const output = run('bun', ['run', 'client:provision', '--', 'config/client.example.json'], {
		env: {
			...process.env,
			PROVISION_OWNER_EMAIL: `p14-owner-${runId}@example.test`,
			PROVISION_OWNER_PASSWORD: `P14-local-${runId}-owner-password!`,
			CLIENT_PROVISION_RESET: 'true'
		}
	});
	const result = JSON.parse(output.split('\n').at(-1));
	assert(
		result.status === 'PROVISIONED_LOCAL' && result.reset === true,
		'Fresh P14 client provisioning did not pass.'
	);
	console.log('P14-T01 fresh local client bootstrap passed');
}

function reconcileRequirements() {
	const coverage = read('docs/REQUIREMENTS_COVERAGE.md');
	const phaseFiles = readdirSync(join(root, 'Phases'))
		.filter((file) => /^PHASE_\d+_.+\.md$/.test(file))
		.sort();
	assert(phaseFiles.length === 15, 'P0–P14 phase authority set is incomplete.');
	for (const phaseFile of phaseFiles) {
		const authority = read(join('Phases', phaseFile));
		assert(
			authority.includes('MUST') && authority.includes('MUST NOT'),
			`${phaseFile} lacks MUST/MUST NOT sections.`
		);
		const ids = [...authority.matchAll(/P\d+-T\d+/g)].map(([id]) => id);
		for (const id of new Set(ids))
			assert(coverage.includes(id), `${id} is missing from requirements coverage.`);
	}
	const registry = JSON.parse(read('docs/release/TEST_EVIDENCE.json'));
	const evidence = validateEvidenceRegistry(registry, { root });
	assert(
		evidence.count === registry.entries.length,
		'Mandatory evidence registry count does not match its unique entries.'
	);
	assert(
		read('docs/PILOT_READINESS.md').includes('NOT_STARTED'),
		'Pilot readiness status boundary is missing.'
	);
	assert(
		read('docs/POST_V1_BACKLOG.md').includes('Status: captured'),
		'Post-v1 backlog template is missing.'
	);
	console.log('P14-T14 requirements coverage reconciliation passed');
}

function validatePilotPackage() {
	const readiness = read('docs/PILOT_READINESS.md');
	for (const phrase of [
		'client-owned',
		'Supabase',
		'Cloudflare',
		'DNS',
		'SPF',
		'DKIM',
		'DMARC',
		'Bricks',
		'staff',
		'feedback',
		'production launch',
		'PILOT_COMPLETE'
	]) {
		assert(readiness.includes(phrase), `Pilot package is missing ${phrase}.`);
	}
	assert(
		!readiness.includes('PILOT_COMPLETE ='),
		'Pilot package falsely marks the pilot complete.'
	);
	console.log('P14-T15 pilot readiness package passed');
}

function runP14SpecificChecks() {
	const state = JSON.parse(read(releaseStatePath()));
	const stateGate =
		state.roadmap_version === '1.4.0'
			? 'release:state:v140'
			: state.execution_stage === 'PHASE_LOOP'
				? 'release:state:p14'
				: 'release:state';
	const checks = [
		'release:state:parity',
		stateGate,
		'test:p14:gate-semantics',
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
	];
	for (const script of checks) run('bun', ['run', script]);
}

provisionFreshClient();
runP14SpecificChecks();
reconcileRequirements();
validatePilotPackage();
console.log('P14-specific release gate passed without invoking ordinary quality recursively');
