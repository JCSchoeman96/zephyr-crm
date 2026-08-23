import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateEvidenceRegistry } from './verify-test-evidence.mjs';

const root = process.cwd();

function run(command, args, options = {}) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 32 * 1024 * 1024,
			...options
		}).trim();
	} catch (error) {
		throw new Error(`${command} failed during the P14 release gate.`, { cause: error });
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function read(path) {
	return readFileSync(path, 'utf8');
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
	const phaseFiles = readdirSync('Phases')
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
	const evidence = validateEvidenceRegistry(registry);
	assert(
		evidence.count === 229,
		`Mandatory evidence registry contains ${evidence.count} IDs, not 229.`
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

function runP14EvidenceCommands() {
	for (const args of [
		['run', 'test:p4:tracer'],
		['run', 'test:p4:tracer'],
		['run', 'test:p7:quotes'],
		['run', 'test:p8:documents'],
		['run', 'db:security'],
		['run', 'test:p5:leads'],
		['run', 'test:v131:communications'],
		['run', 'test:p12:hardening'],
		['run', 'test:p13:template'],
		['run', 'test:p12:hardening'],
		['run', 'build'],
		['run', 'release:state:p14']
	]) {
		run('bun', args);
	}
}

provisionFreshClient();
run('bun', ['run', 'quality']);
runP14EvidenceCommands();
reconcileRequirements();
validatePilotPackage();
console.log('P14-T13 full project quality gate passed');
