import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lifecycleFields = [
	'goal_status',
	'local_build_status',
	'release_status',
	'pilot_status',
	'production_status'
];
const stateFields = ['execution_stage', 'current_phase', 'phase_status', ...lifecycleFields];

function fail(message) {
	throw new Error(`Release truth: ${message}`);
}

function projectionFromState(state) {
	if (!state || typeof state !== 'object') fail('machine state must be an object');
	const projection = {};
	for (const field of stateFields) {
		if (typeof state[field] !== 'string' || state[field].trim() === '') {
			fail(`machine state is missing ${field}`);
		}
		projection[field] = state[field];
	}
	return projection;
}

function assertProjectionEqual(expected, actual, label, fields = stateFields) {
	for (const field of fields) {
		if (expected[field] !== actual[field]) {
			fail(
				`${label} ${field}=${actual[field]} does not match authoritative machine state ${expected[field]}`
			);
		}
	}
}

function validateLifecycleCombination(state) {
	const terminal = state.execution_stage === 'COMPLETE';
	const phaseLoop = state.execution_stage === 'PHASE_LOOP';
	const finalValidation = state.execution_stage === 'FINAL_PROJECT_VALIDATION';
	if (!terminal && !phaseLoop && !finalValidation) {
		fail('execution_stage is not an approved release state');
	}
	if (state.current_phase !== 'P14') fail('current_phase must be P14');

	if (terminal) {
		if (
			state.goal_status !== 'COMPLETE' ||
			state.phase_status !== 'COMPLETE' ||
			state.local_build_status !== 'LOCAL_BUILD_COMPLETE' ||
			state.release_status !== 'PILOT_READY' ||
			state.pilot_status !== 'NOT_STARTED' ||
			state.production_status !== 'NOT_LAUNCHED'
		) {
			fail('terminal lifecycle combination is invalid');
		}
		return;
	}

	if (finalValidation) {
		if (
			state.goal_status !== 'IN_PROGRESS' ||
			state.phase_status !== 'COMPLETE' ||
			state.local_build_status !== 'FINAL_VALIDATION_PENDING' ||
			state.release_status !== 'NOT_READY' ||
			state.pilot_status !== 'NOT_STARTED' ||
			state.production_status !== 'NOT_LAUNCHED'
		) {
			fail('final-validation lifecycle combination is invalid');
		}
		return;
	}

	if (
		state.goal_status !== 'IN_PROGRESS' ||
		state.phase_status !== 'VALIDATING' ||
		state.local_build_status !== 'FINAL_VALIDATION_PENDING' ||
		state.release_status !== 'NOT_READY' ||
		state.pilot_status !== 'NOT_STARTED' ||
		state.production_status !== 'NOT_LAUNCHED'
	) {
		fail('non-terminal lifecycle combination is invalid');
	}
}

export function parseReadinessProjection(readinessText) {
	if (typeof readinessText !== 'string' || readinessText.trim() === '') {
		fail('human readiness projection is empty');
	}
	const projection = {};
	for (const field of stateFields) {
		const match = readinessText.match(new RegExp(`^${field}\\s*=\\s*([^\\s\\r\\n]+)\\s*$`, 'm'));
		if (!match) fail(`human readiness projection is missing ${field}`);
		projection[field] = match[1];
	}
	return projection;
}

export function parseStateMarkdownProjection(stateText) {
	if (typeof stateText !== 'string' || stateText.trim() === '') fail('human loop state is empty');
	const projection = {};
	for (const field of stateFields) {
		const match = stateText.match(new RegExp(`^${field}\\s*=\\s*([^\\s\\r\\n]+)\\s*$`, 'm'));
		if (!match) fail(`human loop state is missing ${field}`);
		projection[field] = match[1];
	}
	return projection;
}

export function validateReleaseTruth(machineState, committedState, readinessText, stateText) {
	validateLifecycleCombination(machineState);
	const authoritative = projectionFromState(machineState);
	const committed = projectionFromState(committedState);
	assertProjectionEqual(authoritative, committed, 'committed release projection');
	const human = parseReadinessProjection(readinessText);
	assertProjectionEqual(authoritative, human, 'human readiness projection');
	if (stateText !== undefined) {
		const humanState = parseStateMarkdownProjection(stateText);
		assertProjectionEqual(authoritative, humanState, 'human loop state');
	}
	return true;
}

function main() {
	const root = process.cwd();
	const machineState = JSON.parse(
		readFileSync(resolve(root, '.agent/goal-loop/STATE.json'), 'utf8')
	);
	const committedState = JSON.parse(
		readFileSync(resolve(root, 'docs/release/P14_READINESS_STATE.json'), 'utf8')
	);
	const readinessText = readFileSync(resolve(root, 'docs/PILOT_READINESS.md'), 'utf8');
	const stateText = readFileSync(resolve(root, '.agent/goal-loop/STATE.md'), 'utf8');
	validateReleaseTruth(machineState, committedState, readinessText, stateText);
	console.log('P14-T22 release truth parity passed');
}

if (process.argv[1]?.endsWith('check-pilot-readiness-parity.mjs')) main();
