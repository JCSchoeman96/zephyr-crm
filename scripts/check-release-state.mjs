import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition, message) {
	if (!condition) throw new Error(`Release state: ${message}`);
}

function hasPhases(state, phases) {
	return (
		Array.isArray(state.completed_phases) &&
		phases.every((phase) => state.completed_phases.includes(phase))
	);
}

export function validateP14ReadinessState(state) {
	assert(state && typeof state === 'object', 'state must be an object.');
	assert(state.execution_stage === 'PHASE_LOOP', 'P14 readiness belongs to the phase loop.');
	assert(
		state.goal_status === 'IN_PROGRESS',
		'goal_status must be IN_PROGRESS before global final validation.'
	);
	assert(state.current_phase === 'P14', 'current_phase must be P14.');
	assert(state.phase_status === 'VALIDATING', 'P14 must still be VALIDATING.');
	assert(
		hasPhases(
			state,
			Array.from({ length: 14 }, (_, index) => `P${index}`)
		),
		'P0–P13 completion list is incomplete.'
	);
	assert(
		!state.completed_phases.includes('P14'),
		'P14 must not be recorded complete during its readiness test.'
	);
	assert(
		state.blocked === false && state.blocked_phase == null,
		'readiness state records a blocker.'
	);
	assert(
		state.local_build_status === 'FINAL_VALIDATION_PENDING',
		'local_build_status must be FINAL_VALIDATION_PENDING.'
	);
	assert(state.release_status === 'NOT_READY', 'release_status must be NOT_READY.');
	assert(state.pilot_status === 'NOT_STARTED', 'pilot_status must be NOT_STARTED.');
	assert(state.production_status === 'NOT_LAUNCHED', 'production_status must be NOT_LAUNCHED.');
	return true;
}

export function validateFinalReleaseState(state) {
	assert(state && typeof state === 'object', 'state must be an object.');
	assert(state.execution_stage === 'COMPLETE', 'execution_stage is not COMPLETE.');
	assert(state.goal_status === 'COMPLETE', 'goal_status is not COMPLETE.');
	assert(
		state.current_phase === 'P14' && state.phase_status === 'COMPLETE',
		'P14 is not COMPLETE.'
	);
	assert(
		hasPhases(
			state,
			Array.from({ length: 15 }, (_, index) => `P${index}`)
		),
		'P0–P14 completion list is incomplete.'
	);
	assert(state.blocked === false && state.blocked_phase == null, 'final state records a blocker.');
	assert(state.final_project_status === 'COMPLETE', 'final_project_status is not COMPLETE.');
	assert(
		state.local_build_status === 'LOCAL_BUILD_COMPLETE',
		'local_build_status is not LOCAL_BUILD_COMPLETE.'
	);
	assert(state.release_status === 'PILOT_READY', 'release_status is not PILOT_READY.');
	assert(state.pilot_status === 'NOT_STARTED', 'pilot_status is not NOT_STARTED.');
	assert(state.production_status === 'NOT_LAUNCHED', 'production_status is not NOT_LAUNCHED.');
	assert(
		state.last_validation?.status === 'PASS' && state.last_validation?.scope === 'GLOBAL_FINAL',
		'GLOBAL_FINAL validation is not recorded as PASS.'
	);
	return true;
}

export function readReleaseState(statePath = '.agent/goal-loop/STATE.json') {
	return JSON.parse(readFileSync(resolve(process.cwd(), statePath), 'utf8'));
}

function main() {
	const args = new Set(process.argv.slice(2));
	const statePath = process.argv
		.find((argument) => argument.startsWith('--state='))
		?.slice('--state='.length);
	const state = readReleaseState(statePath ?? '.agent/goal-loop/STATE.json');
	if (args.has('--p14-readiness')) {
		validateP14ReadinessState(state);
		console.log('P14-T16 non-terminal final-gate readiness passed');
		return;
	}
	if (args.has('--final')) {
		validateFinalReleaseState(state);
		console.log('Global final release state passed');
		return;
	}
	if (state.execution_stage === 'COMPLETE') {
		validateFinalReleaseState(state);
		console.log('Global final release state passed');
		return;
	}
	if (state.current_phase === 'P14' && state.phase_status === 'VALIDATING') {
		validateP14ReadinessState(state);
		console.log('P14-T16 non-terminal final-gate readiness passed');
		return;
	}
	throw new Error(
		'Release state is neither P14 readiness nor terminal global completion; use --p14-readiness or --final for an explicit gate.'
	);
}

if (process.argv[1] && process.argv[1].endsWith('check-release-state.mjs')) main();
