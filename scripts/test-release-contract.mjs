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

const phase0Source = readFileSync('Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md', 'utf8');
const evidenceRegistry = JSON.parse(readFileSync('docs/release/TEST_EVIDENCE.json', 'utf8'));
const phase0Evidence = new Map(
	evidenceRegistry.entries
		.filter((entry) => entry.id.startsWith('P0-'))
		.map((entry) => [entry.id, entry])
);

function evidenceSources(entry) {
	if (Array.isArray(entry?.proof?.sources)) return entry.proof.sources;
	if (typeof entry?.proof?.source === 'string') {
		return [{ source: entry.proof.source, contains: entry.proof.contains ?? [] }];
	}
	return [];
}

function assertStaticEvidence(id, expectedSources) {
	const entry = phase0Evidence.get(id);
	assert(entry, `${id} is missing from the generated evidence registry.`);
	assert(entry.classification === 'STATIC', `${id} must use criterion-specific static evidence.`);
	const actualSources = evidenceSources(entry);
	for (const [source, tokens] of expectedSources) {
		const actual = actualSources.find((candidate) => candidate.source === source);
		assert(actual, `${id} must reference ${source}.`);
		for (const token of tokens) {
			assert(actual.contains?.includes(token), `${id} must prove ${token} from ${source}.`);
		}
	}
}

assertStaticEvidence('P0-T01', [
	['docs/ARCHITECTURE.md', ['Each domain and its canonical resources are defined']],
	['docs/DOMAIN_MODEL.md', ['This document is the single definition of Zephyr CRM resources']],
	['docs/STATE_MACHINES.md', ['## Lead attention']],
	['docs/SECURITY_MODEL.md', ['## Protected-field/action mutation matrix']],
	['docs/ROADMAP.md', ['No phase may introduce a competing definition']]
]);
assertStaticEvidence('P0-T02', [
	['docs/ARCHITECTURE.md', ['## Product boundary']],
	['docs/DOMAIN_MODEL.md', ['## Resource map']],
	['docs/STATE_MACHINES.md', ['Canonical values are lowercase']],
	['docs/SECURITY_MODEL.md', ['## Authorization matrix']],
	['docs/ROADMAP.md', ['No phase may introduce a competing definition for Lead']]
]);
assertStaticEvidence('P0-T03', [
	[
		'docs/ARCHITECTURE.md',
		['## Deferred scope', 'future product decisions, not hidden current requirements.']
	],
	['docs/ROADMAP.md', ['## Deferred v1 scope', 'outside P0–P14']]
]);
assertStaticEvidence('P0-T05', [
	['docs/ROADMAP.md', ['Dependencies are strict and sequential.', '| P0 |', '| P1 |']]
]);
assertStaticEvidence('P0-T06', [
	['docs/STATE_MACHINES.md', ['waiting_on_client', 'pause_reason', 'type = follow_up', 'overdue']]
]);
assertStaticEvidence('P0-T07', [
	[
		'docs/MONEY_CONTRACT.md',
		['PostgreSQL `numeric` values and decimal', 'ROUND_HALF_UP', 'server-owned']
	]
]);
assertStaticEvidence('P0-T08', [
	[
		'docs/SECURITY_MODEL.md',
		[
			'## Protected-field/action mutation matrix',
			'Activity remains append-only evidence',
			'ordinary UPDATE/DELETE'
		]
	]
]);
assertStaticEvidence('P0-T09', [
	[
		'docs/DOMAIN_MODEL.md',
		[
			'complete seller/recipient/commercial snapshots',
			'Commercial settings are copied into the Quote snapshot'
		]
	],
	['docs/STATE_MACHINES.md', ['old Quote remains unchanged and historically readable']],
	['docs/SECURITY_MODEL.md', ['acceptance fields', 'document path/hash/provenance']]
]);
assertStaticEvidence('P0-T10', [
	[
		'docs/STATE_MACHINES.md',
		[
			'## Outbound Message lifecycle',
			'submission_unknown',
			'Each logical message keeps append-only attempt evidence',
			'No automatic resend is allowed'
		]
	]
]);
assertStaticEvidence('P0-T11', [
	['docs/PRIVACY_OPERATIONS.md', ['data-subject access', 'POPIA/legal notification procedure']],
	[
		'docs/RECOVERY_CONTRACT.md',
		[
			'A PostgreSQL dump alone is not recovery proof.',
			'Auth identity reconstruction inputs',
			'secret restoration procedures'
		]
	]
]);
assertStaticEvidence('P0-T12', [
	[
		'docs/METRICS_CONTRACT.md',
		['inclusive UTC calendar dates', 'configured IANA timezone', 'Won / (Won + Lost) * 100']
	],
	['docs/DOMAIN_MODEL.md', ['### ClientContact', '`ClientContact` belongs to one Client']],
	[
		'src/lib/domain/contacts/phone.ts',
		[
			'Normalize only numbers that already declare an international country code.',
			"startsWith('+')"
		]
	],
	[
		'docs/TOOLCHAIN_PROOF.md',
		['Bun package manager/runner', 'Every direct dependency is exact-pinned']
	]
]);
assertStaticEvidence('P0-T13', [
	[
		'DEPENDENCY_BASELINE_v1.0.0.md',
		['## 2. Runtime and Build Responsibility', 'Bun', 'SvelteKit', 'SendPulse']
	]
]);
assertStaticEvidence('P0-T14', [
	[
		'DEPENDENCY_BASELINE_v1.0.0.md',
		[
			'## 6. Exact-Pin Law',
			'## 7. ShadCN Source-Ownership Law',
			'## 11. State, Forms, Dates and Realtime',
			'An autonomous agent must not introduce a new production dependency'
		]
	]
]);
assertStaticEvidence('P0-T15', [
	[
		'docs/SECURITY_MODEL.md',
		['SECURITY INVOKER', 'SECURITY DEFINER', 'search_path', 'restricted `EXECUTE` grants']
	]
]);
assertStaticEvidence('P0-T16', [
	[
		'docs/SECURITY_MODEL.md',
		['invitation-only', 'raw_user_meta_data', 'current session must satisfy AAL2']
	]
]);
assertStaticEvidence('P0-T17', [
	['AGENTS.md', ['authority_sha256', 'EXECUTION STOP — Unexpected Authority Drift']],
	['scripts/verify-authority-hashes.mjs', ['Authority drift detected in', 'recordedPaths']],
	['docs/AUTHORITY_HASHES.json', ['"docs/STATE_MACHINES.md"']]
]);

const p0T04 = phase0Evidence.get('P0-T04');
assert(p0T04, 'P0-T04 is missing from the generated evidence registry.');
assert(p0T04.classification === 'HISTORICAL', 'P0-T04 must be historical evidence.');
assert(
	p0T04.proof?.boundary_commit === '021d6fc7c29071da9f235a7d1275f688452c25de',
	'P0-T04 must reference the durable docs-only Phase 0 boundary commit.'
);
assert(
	p0T04.proof?.implementation_start_commit === '21f2e18ea2c6e3a3f44c8b3100c764b2a4e09f62',
	'P0-T04 must reference the first scaffold commit after the Phase 0 boundary.'
);
assert(
	/Historical Git provenance is reviewed manually/.test(p0T04.proof?.limitation ?? ''),
	'P0-T04 must disclose that historical provenance is not an automated authority proof.'
);
assert(
	phase0Source.includes('`P0-T01` through `P0-T17`') &&
		phase0Source.includes(
			'Phase-1-created application format/lint/type/test/build and database lifecycle gates are not prerequisites'
		),
	'Phase 0 close semantics must exclude facilities created by Phase 1 when they do not yet exist.'
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

const trackedP14Readiness = JSON.parse(
	readFileSync('docs/release/P14_READINESS_STATE.json', 'utf8')
);
assert.doesNotThrow(
	() => validateP14ReadinessState(trackedP14Readiness),
	'Tracked P14 readiness state must be independently executable from a clean checkout.'
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
