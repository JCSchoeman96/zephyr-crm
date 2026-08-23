import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { validateEvidenceRegistry } = await import('./verify-test-evidence.mjs');
const { validateP14ReadinessState, validateFinalReleaseState } =
	await import('./check-release-state.mjs');
const { validateReleaseManifest } = await import('./verify-release-manifest.mjs');

const p14Source = readFileSync('scripts/test-p14-release.mjs', 'utf8');
assert(
	!/phrase\.length\s*>\s*0|Quality evidence label must be non-empty|passed via the authoritative local quality contracts/.test(
		p14Source
	)
);

const expectedIds = ['P0-T01'];

assert.throws(
	() =>
		validateEvidenceRegistry(
			{
				version: 'v1.3.1',
				entries: [
					{
						id: 'P0-T01',
						classification: 'AUTOMATED',
						proof: { command: 'bun run test:p0', assertion: 'quality passed' }
					}
				]
			},
			{ expectedIds }
		),
	/proof.*source|exact assertion/i,
	'Ceremonial labels must not satisfy an automated evidence entry.'
);

assert.throws(
	() =>
		validateEvidenceRegistry(
			{
				version: 'v1.3.1',
				entries: [
					{
						id: 'P0-T01',
						classification: 'STATIC',
						proof: {
							command: 'bun run authority:verify',
							source: 'Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md',
							contains: ['P0-T01']
						}
					}
				]
			},
			{ expectedIds: ['P0-T01', 'P0-T02'] }
		),
	/missing=P0-T02/i,
	'Missing mandatory IDs must fail registry verification.'
);

assert.throws(
	() =>
		validateEvidenceRegistry(
			{
				version: 'v1.3.1',
				entries: [
					{
						id: 'P0-T01',
						classification: 'STATIC',
						proof: {
							command: 'bun run authority:verify',
							source: 'Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md',
							contains: ['P0-T01']
						}
					},
					{
						id: 'P0-T01',
						classification: 'STATIC',
						proof: {
							command: 'bun run authority:verify',
							source: 'Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md',
							contains: ['P0-T01']
						}
					}
				]
			},
			{ expectedIds: ['P0-T01'] }
		),
	/duplicate ID/i,
	'Duplicate mandatory IDs must fail registry verification.'
);

assert.throws(
	() => validateReleaseManifest({ version: 'v1.3.1', application_version: '1.0.0' }),
	/rc|application_version/i,
	'Release manifest must require an application RC identity.'
);

assert.doesNotThrow(() =>
	validateReleaseManifest({
		version: 'v1.3.1',
		application_version: 'v1.0.0-rc.1',
		authority_version: 'v1.3.1',
		mandatory_test_registry: {
			path: 'docs/release/TEST_EVIDENCE.json',
			version: 'v1.3.1',
			count: 229
		},
		expected_commands: ['bun run authority:registry', 'bun run authority:verify'],
		git_sha: 'GENERATED_AT_VALIDATION',
		release_evidence_path: '.agent/goal-loop/RELEASE_EVIDENCE.json',
		lifecycle: {
			release_status: 'PILOT_READY',
			pilot_status: 'NOT_STARTED',
			production_status: 'NOT_LAUNCHED'
		}
	})
);

assert.throws(
	() =>
		validateEvidenceRegistry(
			{
				version: 'v1.3.1',
				entries: [
					{
						id: 'P0-T01',
						classification: 'EXTERNAL',
						status: 'PASS',
						proof: { gate: 'Hosted pilot observation', localPass: true }
					}
				]
			},
			{ expectedIds }
		),
	/external.*local|local.*pass/i,
	'External-only evidence must never be recorded as local PASS.'
);

const p14Readiness = {
	goal_status: 'IN_PROGRESS',
	execution_stage: 'PHASE_LOOP',
	current_phase: 'P14',
	phase_status: 'VALIDATING',
	completed_phases: Array.from({ length: 14 }, (_, index) => `P${index}`),
	blocked: false,
	blocked_phase: null,
	local_build_status: 'FINAL_VALIDATION_PENDING',
	release_status: 'NOT_READY',
	pilot_status: 'NOT_STARTED',
	production_status: 'NOT_LAUNCHED'
};

assert.doesNotThrow(
	() => validateP14ReadinessState(p14Readiness),
	'P14 readiness must be non-terminal before the global final gate.'
);
assert.doesNotThrow(
	() =>
		validateP14ReadinessState({
			...p14Readiness,
			completed_phases: ['RH01', 'RH02', 'RH03', 'RH04', 'RH05', 'RH06'],
			completed_baseline_phases: Array.from({ length: 14 }, (_, index) => `P${index}`)
		}),
	'P14 readiness must use the separate baseline completion list when the hardening loop tracks RH phases.'
);
assert.throws(
	() => validateP14ReadinessState({ ...p14Readiness, goal_status: 'COMPLETE' }),
	/goal_status.*IN_PROGRESS/i,
	'P14 readiness must reject terminal global state.'
);
assert.throws(
	() =>
		validateP14ReadinessState({
			...p14Readiness,
			completed_phases: [...p14Readiness.completed_phases, 'P14']
		}),
	/P14.*not.*complete|P14.*must not/i,
	'P14 readiness must not require or record P14 as complete.'
);

const finalState = {
	...p14Readiness,
	goal_status: 'COMPLETE',
	execution_stage: 'COMPLETE',
	current_phase: 'P14',
	phase_status: 'COMPLETE',
	completed_phases: Array.from({ length: 15 }, (_, index) => `P${index}`),
	local_build_status: 'LOCAL_BUILD_COMPLETE',
	release_status: 'PILOT_READY',
	last_validation: { status: 'PASS', scope: 'GLOBAL_FINAL' },
	final_project_status: 'COMPLETE'
};

assert.doesNotThrow(
	() => validateFinalReleaseState(finalState),
	'Only the global final gate may prove terminal release state.'
);
assert.throws(
	() =>
		validateFinalReleaseState({ ...finalState, last_validation: { status: 'PASS', scope: 'P14' } }),
	/GLOBAL_FINAL/i,
	'Terminal state must be tied to the global final validation.'
);

console.log('RH01 release-contract unit assertions passed');
