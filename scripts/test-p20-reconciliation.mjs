import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateEvidenceRegistry } from './verify-test-evidence.mjs';
import { validateV140ReleaseEvidence } from './verify-v140-release-evidence.mjs';

const root = process.cwd();
const localStatePath = '.agent/goal-loop/STATE.json';
const phaseIds = Array.from({ length: 21 }, (_, index) => `P${index}`);
const coreAuthorities = [
	'docs/ARCHITECTURE.md',
	'docs/DOMAIN_MODEL.md',
	'docs/STATE_MACHINES.md',
	'docs/SECURITY_MODEL.md',
	'docs/MONEY_CONTRACT.md',
	'docs/METRICS_CONTRACT.md',
	'docs/PRIVACY_OPERATIONS.md',
	'docs/RECOVERY_CONTRACT.md',
	'docs/ROADMAP.md',
	'DEPENDENCY_BASELINE_v1.0.0.md'
];
const metricFields = [
	'New enquiries waiting',
	'Qualification backlog',
	'Quotes needing preparation',
	'Quotes awaiting decision',
	'Average quote response time',
	'Accepted value',
	'Open fulfilments',
	'Upcoming installations',
	'Awaiting dispatch',
	'Awaiting collection',
	'Payments awaiting follow-up',
	'Completed fulfilments'
];

function fail(message) {
	throw new Error(`P20 reconciliation: ${message}`);
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

function assertStateHashes(state) {
	assert(state.roadmap_sha256 === sha256(state.roadmap), 'root roadmap hash is stale');
	assert(state.architecture_sha256 === sha256(state.architecture), 'architecture hash is stale');
	for (const [path, expected] of Object.entries(state.authority_sha256 ?? {})) {
		assert(expected === sha256(path), `authority hash is stale for ${path}`);
	}
	assert(
		JSON.stringify(Object.keys(state.phase_authority_paths ?? {}).sort()) ===
			JSON.stringify(phaseIds.sort()),
		'phase authority path set is not P0-P20'
	);
	for (const phase of phaseIds) {
		const path = state.phase_authority_paths[phase];
		assert(
			path && state.phase_authority_sha256?.[phase] === sha256(path),
			`phase ${phase} authority hash is stale`
		);
	}
}

function assertStateProjection(state) {
	assert(state.state_schema_version === 3, 'state schema version is not 3');
	assert(state.roadmap_version === '1.4.0', 'state roadmap version is not 1.4.0');
	assert(state.current_phase === 'P20', 'state current phase is not P20');
	assert(state.completed_phases?.includes('P19'), 'P19 is not complete in local state');
	assert(
		state.current_subphase === 'P20-T01' || state.current_subphase === 'P20-T02',
		'P20 subphase is invalid'
	);
}

function assertAuthorityCoverage(state) {
	const registry = readJson('docs/AUTHORITY_HASHES.json');
	for (const path of coreAuthorities) {
		assert(state.authority_sha256[path], `state authority map is missing ${path}`);
		assert(registry.files?.[path], `authority registry is missing ${path}`);
	}
	const phaseAuthorityFiles = Object.values(state.phase_authority_paths);
	for (const path of phaseAuthorityFiles)
		assert(existsSync(resolve(root, path)), `missing phase authority ${path}`);
}

function assertTrackedAuthorityRegistry() {
	const registry = readJson('docs/AUTHORITY_HASHES_V1.4.0.json');
	assert(registry.version === '1.4.0', 'tracked v1.4 authority registry version is invalid');
	for (const [path, expected] of Object.entries(registry.files ?? {})) {
		assert(existsSync(resolve(root, path)), `missing tracked v1.4 authority file ${path}`);
		assert(expected === sha256(path), `tracked v1.4 authority hash is stale for ${path}`);
	}
}

function assertCanonicalContracts() {
	const roadmap = read('docs/ROADMAP.md');
	const metrics = read('docs/METRICS_CONTRACT.md');
	const phase = read('docs/phases/PHASE_20_ANALYTICS_RELEASE_RECONCILIATION.md');
	const migration = read('supabase/migrations/20260827110000_v140_dashboard_metrics.sql');
	const types = read('src/lib/types/database.ts');
	for (const phrase of [
		'P15-P20',
		'P20 analytics and release reconciliation',
		'v1.4.0 architecture authority'
	])
		assert(roadmap.includes(phrase), `roadmap is missing ${phrase}`);
	for (const field of metricFields)
		assert(metrics.includes(field), `metrics contract is missing ${field}`);
	for (const id of ['P20-T01', 'P20-T02'])
		assert(phase.includes(id), `P20 authority is missing ${id}`);
	for (const phrase of [
		'validate_dashboard_range',
		'security invoker',
		'quotes_dashboard_current_actionable_idx',
		'fulfilment_steps_dashboard_metrics_idx',
		'fulfilment_cases_dashboard_completed_idx',
		'payment_milestones_dashboard_awaiting_idx',
		'quotes_dashboard_declined_idx',
		'grant execute on function public.dashboard_sales_fulfilment_metrics(date, date) to authenticated',
		'revoke all on function public.dashboard_sales_fulfilment_metrics(date, date) from public, anon'
	]) {
		assert(migration.includes(phrase), `metrics migration is missing ${phrase}`);
	}
	assert(
		types.includes('dashboard_sales_fulfilment_metrics'),
		'generated database types omit the metrics RPC'
	);
}

function main() {
	if (existsSync(resolve(root, localStatePath))) {
		const state = readJson(localStatePath);
		assertStateProjection(state);
		assertStateHashes(state);
		assertAuthorityCoverage(state);
	} else {
		assertTrackedAuthorityRegistry();
	}
	assertCanonicalContracts();
	const historical = readJson('docs/release/TEST_EVIDENCE.json');
	const historicalValidation = validateEvidenceRegistry(historical, { root });
	assert(historicalValidation.count === 243, 'historical v1.3.2 evidence count is not 243');
	const v140Evidence = readJson('docs/release/V1.4.0_RELEASE_EVIDENCE.json');
	validateV140ReleaseEvidence(v140Evidence, {
		root,
		requireComplete: process.argv.includes('--complete')
	});
	console.log(
		`P20-T02 authority, generated-type, historical-registry, and v1.4.0 evidence reconciliation passed${process.argv.includes('--complete') ? ' completely' : ''}`
	);
}

main();
