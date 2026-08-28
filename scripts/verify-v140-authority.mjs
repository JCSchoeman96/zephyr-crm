import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const registryPath = 'docs/AUTHORITY_HASHES_V1.4.0.json';
const phasePaths = {
	P15: 'docs/phases/PHASE_15_WORKFLOW_FULFILMENT_ARCHITECTURE.md',
	P16: 'docs/phases/PHASE_16_FULFILMENT_PERSISTENCE_FOUNDATION.md',
	P17: 'docs/phases/PHASE_17_SALES_TO_FULFILMENT_TRACER_BULLET.md',
	P18: 'docs/phases/PHASE_18_SALES_FUNNEL_WORK_QUEUES.md',
	P19: 'docs/phases/PHASE_19_FULFILMENT_WORK_QUEUES.md',
	P20: 'docs/phases/PHASE_20_ANALYTICS_RELEASE_RECONCILIATION.md'
};
const requiredFiles = [
	'CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md',
	'docs/ROADMAP.md',
	'docs/FULFILMENT_ARCHITECTURE.md',
	'docs/ARCHITECTURE.md',
	'docs/DOMAIN_MODEL.md',
	'docs/STATE_MACHINES.md',
	'docs/SECURITY_MODEL.md',
	'docs/MONEY_CONTRACT.md',
	'docs/METRICS_CONTRACT.md',
	'docs/PRIVACY_OPERATIONS.md',
	'docs/RECOVERY_CONTRACT.md',
	'docs/TOOLCHAIN_PROOF.md',
	'docs/TASK_AUTOMATION.md',
	'docs/OPERATIONS.md',
	'docs/CLIENT_DEPLOYMENT.md',
	'DEPENDENCY_BASELINE_v1.0.0.md',
	...Object.values(phasePaths)
];

function fail(message) {
	throw new Error(`v1.4.0 authority: ${message}`);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function read(path) {
	try {
		return readFileSync(resolve(root, path), 'utf8');
	} catch {
		fail(`cannot read ${path}`);
	}
}

function readJson(path) {
	try {
		return JSON.parse(read(path));
	} catch {
		fail(`invalid JSON in ${path}`);
	}
}

function sha256(path) {
	return createHash('sha256').update(read(path)).digest('hex');
}

const registry = readJson(registryPath);
assert(registry.version === '1.4.0', 'registry version must be 1.4.0');
assert(
	registry.scope === 'v1.4.0 additive roadmap and frozen cross-domain authority',
	'registry scope is invalid'
);
assert(registry.files && typeof registry.files === 'object', 'registry files are missing');
assert(
	JSON.stringify(Object.keys(registry.files).sort()) === JSON.stringify([...requiredFiles].sort()),
	'registry file set does not match the frozen v1.4.0 authority set'
);

for (const path of requiredFiles) {
	assert(existsSync(resolve(root, path)), `authority file is missing: ${path}`);
	assert(registry.files[path] === sha256(path), `registry hash is stale for ${path}`);
}

const localStatePath = '.agent/goal-loop/STATE.json';
if (existsSync(resolve(root, localStatePath))) {
	const state = readJson(localStatePath);
	const v140IsActive =
		state.roadmap === 'CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md' &&
		state.architecture === 'docs/FULFILMENT_ARCHITECTURE.md';
	const v150Identity =
		state.roadmap_version === '1.5.0' &&
		state.roadmap === 'CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md' &&
		state.architecture === 'docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md';
	const v150PhaseLoopSuccessor =
		v150Identity &&
		state.execution_stage === 'PHASE_LOOP' &&
		/^P(2[1-6])$/.test(state.current_phase ?? '') &&
		Array.isArray(state.completed_phases) &&
		Array.from({ length: 21 }, (_, index) => `P${index}`).every((phase) =>
			state.completed_phases.includes(phase)
		);
	const v150TerminalSuccessor =
		v150Identity &&
		state.goal_status === 'COMPLETE' &&
		state.execution_stage === 'COMPLETE' &&
		state.current_phase === 'P26' &&
		state.phase_status === 'COMPLETE' &&
		state.local_build_status === 'LOCAL_BUILD_COMPLETE' &&
		state.release_status === 'PILOT_READY' &&
		state.pilot_status === 'NOT_STARTED' &&
		state.production_status === 'NOT_LAUNCHED' &&
		Array.isArray(state.completed_phases) &&
		Array.from({ length: 27 }, (_, index) => `P${index}`).every((phase) =>
			state.completed_phases.includes(phase)
		);
	const v150IsSuccessor = v150PhaseLoopSuccessor || v150TerminalSuccessor;
	assert(v140IsActive || v150IsSuccessor, 'v1.4.0 state has no valid active or successor roadmap');
	for (const path of requiredFiles) {
		assert(
			state.authority_sha256?.[path] === registry.files[path],
			`state hash is stale for ${path}`
		);
	}
	assert(
		state.authority_sha256?.[registryPath] === sha256(registryPath),
		'state hash is missing for the v1.4 registry'
	);
	for (const [phase, path] of Object.entries(phasePaths)) {
		assert(state.phase_authority_paths?.[phase] === path, `${phase} phase path is not canonical`);
		assert(
			state.phase_authority_sha256?.[phase] === registry.files[path],
			`${phase} phase hash is stale`
		);
	}
}

const roadmap = read('CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md');
assert(
	roadmap.includes('P15-P20') && roadmap.includes('v1.4.0'),
	'v1.4.0 roadmap markers are missing'
);
for (const [phase, path] of Object.entries(phasePaths)) {
	const source = read(path);
	assert(source.includes(phase), `${phase} authority marker is missing`);
	assert(new RegExp(`${phase}-T\\d+`).test(source), `${phase} mandatory IDs are missing`);
}

console.log(
	`v1.4.0 authority verification passed: ${requiredFiles.length} files, P15-P20 phase set, and ${existsSync(resolve(root, localStatePath)) ? 'local state hashes' : 'tracked registry hashes'}.`
);
