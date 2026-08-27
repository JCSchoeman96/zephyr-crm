import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateV140ReleaseEvidence } from './verify-v140-release-evidence.mjs';

const phaseIds = Array.from({ length: 21 }, (_, index) => `P${index}`);
const lifecycleFields = [
	'goal_status',
	'local_build_status',
	'release_status',
	'pilot_status',
	'production_status'
];

function fail(message) {
	throw new Error(`v1.4.0 release state: ${message}`);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function phases(state) {
	return Array.isArray(state?.completed_phases) ? state.completed_phases : [];
}

function requirePhases(state, expected) {
	assert(
		expected.every((phase) => phases(state).includes(phase)),
		'completed phase list is incomplete'
	);
}

function requireBaseState(state) {
	assert(state && typeof state === 'object', 'machine state must be an object');
	assert(state.state_schema_version === 3, 'state schema version must be 3');
	assert(state.roadmap_version === '1.4.0', 'roadmap version must be 1.4.0');
	assert(state.roadmap === 'CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md', 'v1.4.0 roadmap is not active');
	assert(
		state.architecture === 'docs/FULFILMENT_ARCHITECTURE.md',
		'v1.4.0 architecture authority is not active'
	);
	assert(state.current_phase === 'P20', 'current phase must be P20');
	assert(state.blocked === false && state.blocked_phase == null, 'state records a blocker');
	assert(
		JSON.stringify(state.ordered_phases) === JSON.stringify(phaseIds),
		'ordered phases are not P0-P20'
	);
	for (const field of lifecycleFields)
		assert(typeof state[field] === 'string', `state is missing ${field}`);
}

function projectionFromMarkdown(text) {
	const projection = {};
	for (const field of ['execution_stage', 'current_phase', 'phase_status', ...lifecycleFields]) {
		const match = text.match(new RegExp(`^${field}\\s*=\\s*([^\\s\\r\\n]+)\\s*$`, 'm'));
		assert(match, `STATE.md is missing ${field}`);
		projection[field] = match[1];
	}
	return projection;
}

function assertMarkdownProjection(state, root) {
	const markdown = readFileSync(resolve(root, '.agent/goal-loop/STATE.md'), 'utf8');
	const projection = projectionFromMarkdown(markdown);
	for (const field of ['execution_stage', 'current_phase', 'phase_status', ...lifecycleFields]) {
		assert(projection[field] === state[field], `STATE.md ${field} does not match STATE.json`);
	}
}

export function validateV140ReadinessState(state) {
	requireBaseState(state);
	assert(state.execution_stage === 'PHASE_LOOP', 'readiness belongs to the phase loop');
	assert(
		state.goal_status === 'IN_PROGRESS',
		'goal_status must be IN_PROGRESS before final validation'
	);
	assert(state.phase_status === 'VALIDATING', 'P20 must still be VALIDATING');
	requirePhases(state, phaseIds.slice(0, 20));
	assert(!phases(state).includes('P20'), 'P20 must not be complete during readiness');
	assert(
		state.local_build_status === 'FINAL_VALIDATION_PENDING',
		'local build is not pending final validation'
	);
	assert(state.release_status === 'NOT_READY', 'release must remain NOT_READY during readiness');
	assert(state.pilot_status === 'NOT_STARTED', 'pilot must remain NOT_STARTED');
	assert(state.production_status === 'NOT_LAUNCHED', 'production must remain NOT_LAUNCHED');
	return true;
}

export function validateV140FinalProjectValidationState(state) {
	requireBaseState(state);
	assert(
		state.execution_stage === 'FINAL_PROJECT_VALIDATION',
		'execution stage must be FINAL_PROJECT_VALIDATION'
	);
	assert(
		state.goal_status === 'IN_PROGRESS',
		'goal_status must remain IN_PROGRESS during final validation'
	);
	assert(state.phase_status === 'COMPLETE', 'P20 must be complete before global final validation');
	requirePhases(state, phaseIds);
	assert(
		state.local_build_status === 'FINAL_VALIDATION_PENDING',
		'local build must remain pending final validation'
	);
	assert(
		state.release_status === 'NOT_READY',
		'release must remain NOT_READY during final validation'
	);
	assert(state.pilot_status === 'NOT_STARTED', 'pilot must remain NOT_STARTED');
	assert(state.production_status === 'NOT_LAUNCHED', 'production must remain NOT_LAUNCHED');
	return true;
}

export function validateV140FinalReleaseState(state) {
	requireBaseState(state);
	assert(state.execution_stage === 'COMPLETE', 'execution stage must be COMPLETE');
	assert(state.goal_status === 'COMPLETE', 'goal_status must be COMPLETE');
	assert(state.phase_status === 'COMPLETE', 'P20 is not complete');
	requirePhases(state, phaseIds);
	assert(state.final_project_status === 'COMPLETE', 'final_project_status is not COMPLETE');
	assert(state.local_build_status === 'LOCAL_BUILD_COMPLETE', 'local build is not complete');
	assert(state.release_status === 'PILOT_READY', 'release is not PILOT_READY');
	assert(state.pilot_status === 'NOT_STARTED', 'pilot must remain NOT_STARTED');
	assert(state.production_status === 'NOT_LAUNCHED', 'production must remain NOT_LAUNCHED');
	assert(
		state.last_validation?.status === 'PASS' &&
			state.last_validation?.scope === 'GLOBAL_FINAL_V140',
		'GLOBAL_FINAL_V140 validation is not recorded as PASS'
	);
	return true;
}

function assertCompleteReleaseEvidence(root) {
	const path = 'docs/release/V1.4.0_RELEASE_EVIDENCE.json';
	assert(existsSync(resolve(root, path)), `${path} does not exist`);
	let evidence;
	try {
		evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
	} catch {
		fail(`${path} is not valid JSON`);
	}
	validateV140ReleaseEvidence(evidence, { root, requireComplete: true });
}

function main() {
	const root = process.cwd();
	const path = '.agent/goal-loop/STATE.json';
	assert(existsSync(resolve(root, path)), `${path} does not exist`);
	const state = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
	assertMarkdownProjection(state, root);
	const args = new Set(process.argv.slice(2));
	if (args.has('--readiness')) {
		validateV140ReadinessState(state);
		console.log('v1.4.0 non-terminal final-gate readiness passed');
		return;
	}
	if (args.has('--final-validation')) {
		validateV140FinalProjectValidationState(state);
		console.log('v1.4.0 final project validation state passed');
		return;
	}
	if (args.has('--final')) {
		validateV140FinalReleaseState(state);
		assertCompleteReleaseEvidence(root);
		console.log('v1.4.0 final release state passed');
		return;
	}
	if (state.execution_stage === 'COMPLETE') {
		validateV140FinalReleaseState(state);
		assertCompleteReleaseEvidence(root);
		console.log('v1.4.0 final release state passed');
		return;
	}
	throw new Error(
		'Use --readiness, --final-validation, or --final for an explicit v1.4.0 release-state gate.'
	);
}

if (process.argv[1]?.endsWith('check-v140-release-state.mjs')) main();
