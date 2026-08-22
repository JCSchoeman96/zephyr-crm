import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync('.agent/goal-loop/STATE.json', 'utf8'));
const expectedPhases = Array.from({ length: 15 }, (_, index) => `P${index}`);
const expectedSubphases = Array.from({ length: 9 }, (_, index) => `P14.${index + 1}`);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

assert(state.goal_status === 'COMPLETE', 'goal_status is not COMPLETE.');
assert(state.current_phase === 'P14' && state.phase_status === 'COMPLETE', 'P14 is not COMPLETE.');
assert(
	expectedPhases.every((phase) => state.completed_phases.includes(phase)),
	'P0–P14 completion list is incomplete.'
);
assert(
	expectedSubphases.every((subphase) => state.completed_subphases.includes(subphase)),
	'P14 subphase completion list is incomplete.'
);
assert(state.blocked === false && state.blocked_phase === null, 'Final state records a blocker.');
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
	'Global validation is not recorded as PASS.'
);
console.log('P14-T16 final local completion state passed');
