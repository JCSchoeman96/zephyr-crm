import assert from 'node:assert/strict';
import {
	parseReadinessProjection,
	parseStateMarkdownProjection,
	validateReleaseTruth
} from './check-pilot-readiness-parity.mjs';

const nonTerminal = {
	goal_status: 'IN_PROGRESS',
	execution_stage: 'PHASE_LOOP',
	current_phase: 'P14',
	phase_status: 'VALIDATING',
	local_build_status: 'FINAL_VALIDATION_PENDING',
	release_status: 'NOT_READY',
	pilot_status: 'NOT_STARTED',
	production_status: 'NOT_LAUNCHED'
};
const finalValidation = {
	...nonTerminal,
	execution_stage: 'FINAL_PROJECT_VALIDATION',
	phase_status: 'COMPLETE'
};
const final = {
	goal_status: 'COMPLETE',
	execution_stage: 'COMPLETE',
	current_phase: 'P14',
	phase_status: 'COMPLETE',
	local_build_status: 'LOCAL_BUILD_COMPLETE',
	release_status: 'PILOT_READY',
	pilot_status: 'NOT_STARTED',
	production_status: 'NOT_LAUNCHED'
};
const readiness = (state) =>
	'\nCurrent lifecycle values:\n\n' +
	'```text\n' +
	`execution_stage = ${state.execution_stage}\n` +
	`current_phase = ${state.current_phase}\n` +
	`phase_status = ${state.phase_status}\n` +
	`goal_status = ${state.goal_status}\n` +
	`local_build_status = ${state.local_build_status}\n` +
	`release_status = ${state.release_status}\n` +
	`pilot_status = ${state.pilot_status}\n` +
	`production_status = ${state.production_status}\n` +
	'```\n';
const stateMarkdown = (state) =>
	Object.entries(state)
		.map(([field, value]) => `${field} = ${value}`)
		.join('\n');

assert.deepEqual(parseReadinessProjection(readiness(nonTerminal)), {
	execution_stage: 'PHASE_LOOP',
	current_phase: 'P14',
	phase_status: 'VALIDATING',
	goal_status: 'IN_PROGRESS',
	local_build_status: 'FINAL_VALIDATION_PENDING',
	release_status: 'NOT_READY',
	pilot_status: 'NOT_STARTED',
	production_status: 'NOT_LAUNCHED'
});
assert.deepEqual(parseStateMarkdownProjection(stateMarkdown(nonTerminal)), nonTerminal);
assert.equal(
	validateReleaseTruth(
		nonTerminal,
		nonTerminal,
		readiness(nonTerminal),
		stateMarkdown(nonTerminal)
	),
	true
);
assert.throws(
	() => validateReleaseTruth(nonTerminal, nonTerminal, readiness(final)),
	/does not match authoritative machine state/
);
assert.equal(validateReleaseTruth(final, final, readiness(final)), true);
assert.equal(
	validateReleaseTruth(
		finalValidation,
		finalValidation,
		readiness(finalValidation),
		stateMarkdown(finalValidation)
	),
	true
);
assert.throws(
	() => validateReleaseTruth(final, { ...final, phase_status: 'VALIDATING' }, readiness(final)),
	/committed release projection/
);
assert.throws(
	() =>
		validateReleaseTruth(
			nonTerminal,
			nonTerminal,
			readiness(nonTerminal),
			'goal_status = IN_PROGRESS'
		),
	/human loop state is missing execution_stage/
);
assert.throws(
	() =>
		validateReleaseTruth(
			nonTerminal,
			nonTerminal,
			readiness({ ...nonTerminal, phase_status: 'COMPLETE' }),
			stateMarkdown(nonTerminal)
		),
	/human readiness projection phase_status=COMPLETE/
);
console.log('P14-T22 release truth parity passed');
