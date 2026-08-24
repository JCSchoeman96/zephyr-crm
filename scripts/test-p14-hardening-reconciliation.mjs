import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
	return readFileSync(path, 'utf8');
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const hardeningPath = 'docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md';
const hardening = read(hardeningPath);
const roadmap = read('CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md');
const phase14 = read('Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md');
const coverage = read('docs/REQUIREMENTS_COVERAGE.md');
const readiness = read('docs/PILOT_READINESS.md');
const postV1Backlog = read('docs/POST_V1_BACKLOG.md');
const disposition = read('docs/release/P14_HARDENING_DISPOSITION.md');
const hashes = JSON.parse(read('docs/AUTHORITY_HASHES.json'));
const evidence = JSON.parse(read('docs/release/TEST_EVIDENCE.json'));
const manifest = JSON.parse(read('docs/release/RELEASE_MANIFEST.json'));
const state = JSON.parse(read('.agent/goal-loop/STATE.json'));
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ci.yml');

const requiredHardeningIds = Array.from(
	{ length: 18 },
	(_, index) => `ZH-${String(index + 1).padStart(3, '0')}`
);
const requiredP14Ids = Array.from({ length: 14 }, (_, index) => `P14-T${index + 22}`);
const hardeningHash = createHash('sha256').update(hardening).digest('hex');

const dispositionRows = [
	...disposition.matchAll(/^\| (ZH-\d{3}) \| (FIXED|NON-BLOCKER) \| ([^|]+) \|$/gm)
].map(([, id, status, evidence]) => {
	const text = evidence.trim();
	return {
		id,
		status,
		evidence: text,
		paths: [...text.matchAll(/`([^`]+)`/g)].map(([, path]) => path),
		testIds: [...text.matchAll(/\bP14-T\d+\b/g)].map(([id]) => id)
	};
});
const evidenceIds = new Set(evidence.entries.map((entry) => entry.id));

assert(
	hardening.includes('ZH-018'),
	'Hardening authority is missing the final trusted-mutation requirement.'
);
assert(
	requiredHardeningIds.every((id) => hardening.includes(id)) && roadmap.includes('ZH-001–ZH-018'),
	'Hardening IDs are not reconciled into current authority.'
);
assert(
	requiredP14Ids.every((id) => phase14.includes(id) && coverage.includes(id)),
	'P14 hardening test IDs are not fully covered.'
);
assert(
	dispositionRows.length === requiredHardeningIds.length &&
		new Set(dispositionRows.map((row) => row.id)).size === requiredHardeningIds.length &&
		requiredHardeningIds.every((id) => {
			const row = dispositionRows.find((candidate) => candidate.id === id);
			return (
				row &&
				row.evidence.length > 0 &&
				row.paths.length > 0 &&
				row.paths.every((path) => existsSync(path)) &&
				row.testIds.length > 0 &&
				row.testIds.every((testId) => evidenceIds.has(testId))
			);
		}),
	'Every frozen hardening item must have one explicit disposition with real file and registry evidence.'
);
assert(
	hardeningHash === 'e34e32711db412658cab9d89bcd02ad8851d53c67693431745eb00ee35d18f2b',
	'Frozen hardening authority hash changed unexpectedly.'
);
assert(
	hashes.files[hardeningPath] === hardeningHash,
	'Frozen hardening authority is not recorded in the hash registry.'
);
assert(
	evidence.entries.length === evidence.entry_count &&
		manifest.mandatory_test_registry.count === evidence.entry_count &&
		manifest.mandatory_test_registry.version === evidence.version,
	'Release evidence and manifest registries are not reconciled.'
);
const phaseLoopProjection =
	state.goal_status === 'IN_PROGRESS' &&
	state.execution_stage === 'PHASE_LOOP' &&
	state.current_phase === 'P14' &&
	state.phase_status === 'VALIDATING' &&
	state.local_build_status === 'FINAL_VALIDATION_PENDING' &&
	state.release_status === 'NOT_READY' &&
	state.pilot_status === 'NOT_STARTED' &&
	state.production_status === 'NOT_LAUNCHED';
const finalValidationProjection =
	state.goal_status === 'IN_PROGRESS' &&
	state.execution_stage === 'FINAL_PROJECT_VALIDATION' &&
	state.current_phase === 'P14' &&
	state.phase_status === 'COMPLETE' &&
	state.completed_phases.includes('P14') &&
	state.local_build_status === 'FINAL_VALIDATION_PENDING' &&
	state.release_status === 'NOT_READY' &&
	state.pilot_status === 'NOT_STARTED' &&
	state.production_status === 'NOT_LAUNCHED';
const terminalProjection =
	state.goal_status === 'COMPLETE' &&
	state.execution_stage === 'COMPLETE' &&
	state.current_phase === 'P14' &&
	state.phase_status === 'COMPLETE' &&
	state.completed_phases.includes('P14') &&
	state.local_build_status === 'LOCAL_BUILD_COMPLETE' &&
	state.release_status === 'PILOT_READY' &&
	state.pilot_status === 'NOT_STARTED' &&
	state.production_status === 'NOT_LAUNCHED' &&
	state.final_project_status === 'COMPLETE' &&
	state.last_validation?.status === 'PASS' &&
	state.last_validation?.scope === 'GLOBAL_FINAL';
assert(
	phaseLoopProjection || finalValidationProjection || terminalProjection,
	'P14 loop state is not an honest release projection.'
);

if (phaseLoopProjection || finalValidationProjection) {
	assert(
		readiness.includes('P14 VALIDATING') &&
			(readiness.includes('execution_stage = PHASE_LOOP') ||
				readiness.includes('execution_stage = FINAL_PROJECT_VALIDATION')) &&
			readiness.includes('FINAL_VALIDATION_PENDING') &&
			readiness.includes('NOT_READY') &&
			readiness.includes('NOT_STARTED') &&
			readiness.includes('NOT_LAUNCHED'),
		'Human pilot readiness projection is missing the non-terminal lifecycle.'
	);
}
if (finalValidationProjection) {
	assert(
		readiness.includes('current_phase = P14') && readiness.includes('phase_status = COMPLETE'),
		'Human pilot readiness projection is missing the final-validation phase projection.'
	);
}
if (terminalProjection) {
	assert(
		readiness.includes('execution_stage = COMPLETE') &&
			readiness.includes('current_phase = P14') &&
			readiness.includes('phase_status = COMPLETE') &&
			readiness.includes('LOCAL_BUILD_COMPLETE') &&
			readiness.includes('PILOT_READY'),
		'Human pilot readiness projection is missing the terminal lifecycle.'
	);
}
assert(postV1Backlog.includes('Status: captured'), 'Deferred work is not captured in the backlog.');
assert(
	packageJson.scripts['release:state:parity'] &&
		packageJson.scripts['test:p14:hardening-reconciliation'] &&
		packageJson.scripts['test:p14:mutation-parity'],
	'P14 reconciliation commands are not executable package scripts.'
);
assert(
	workflow.includes('browser-domain-e2e:') && workflow.includes('p14-release:'),
	'CI does not protect the stateful browser and P14 release prerequisites.'
);

console.log('P14-T34 hardening authority/evidence reconciliation passed');
