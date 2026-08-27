import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedIds = [
	...Array.from({ length: 3 }, (_, index) => `P15-T0${index + 1}`),
	...Array.from({ length: 3 }, (_, index) => `P16-T0${index + 1}`),
	...Array.from({ length: 4 }, (_, index) => `P17-T0${index + 1}`),
	...Array.from({ length: 6 }, (_, index) => `P18-T0${index + 1}`),
	...Array.from({ length: 6 }, (_, index) => `P19-T0${index + 1}`),
	'P20-T01',
	'P20-T02'
];

function fail(message) {
	throw new Error(`v1.4.0 release evidence: ${message}`);
}

function readJson(root, path) {
	try {
		return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
	} catch {
		fail(`cannot read JSON file ${path}`);
	}
}

export function validateV140ReleaseEvidence(evidence, options = {}) {
	if (!evidence || typeof evidence !== 'object') fail('evidence must be an object');
	if (evidence.version !== 'v1.4.0') fail('version must be v1.4.0');
	if (evidence.application_version !== 'v1.0.0-rc.1')
		fail('application_version must remain v1.0.0-rc.1');
	if (evidence.scope !== 'LOCAL_ONLY') fail('scope must remain LOCAL_ONLY');
	if (evidence.source_state !== '.agent/goal-loop/STATE.json')
		fail('source_state must point to the local machine state');
	const root = options.root ?? process.cwd();
	const historical = evidence.historical_evidence;
	if (!historical || historical.path !== 'docs/release/TEST_EVIDENCE.json')
		fail('historical v1.3.2 evidence path is missing');
	const historicalOnDisk = readJson(root, historical.path);
	if (historical.version !== historicalOnDisk.version || historical.version !== 'v1.3.2')
		fail('historical evidence version does not match v1.3.2');
	if (historical.entry_count !== historicalOnDisk.entry_count)
		fail('historical evidence count does not match the registry');
	if (!Array.isArray(evidence.phase_evidence)) fail('phase_evidence must be an array');
	const entries = new Map();
	for (const entry of evidence.phase_evidence) {
		if (!entry?.id || entries.has(entry.id)) fail(`duplicate or empty evidence ID ${entry?.id}`);
		if (!entry.command || !Array.isArray(entry.sources) || entry.sources.length === 0)
			fail(`${entry.id} must include a command and source proof`);
		if (
			entry.sources.some(
				(source) => typeof source !== 'string' || !existsSync(resolve(root, source))
			)
		)
			fail(`${entry.id} references a missing source proof`);
		if (!['PASS', 'PENDING'].includes(entry.status)) fail(`${entry.id} has an invalid status`);
		entries.set(entry.id, entry);
	}
	for (const id of expectedIds) {
		if (!entries.has(id)) fail(`${id} is missing`);
		if (options.requireComplete && entries.get(id).status !== 'PASS')
			fail(`${id} is not marked PASS for complete reconciliation`);
	}
	if (options.requireComplete && entries.get('P20-T02').status !== 'PASS')
		fail('P20-T02 must be PASS for terminal release evidence');
	if (
		typeof evidence.payment_revenue_boundary !== 'string' ||
		!evidence.payment_revenue_boundary.includes('not reconciled revenue') ||
		!evidence.payment_revenue_boundary.includes('bank settlement')
	) {
		fail('payment/revenue evidence boundary is incomplete');
	}
	const boundaries = evidence.external_boundaries;
	if (!boundaries || Object.values(boundaries).some((value) => value !== false))
		fail('external deployment, pilot, production, or accounting proof was falsely claimed');
	return true;
}

function main() {
	const root = process.cwd();
	const path = 'docs/release/V1.4.0_RELEASE_EVIDENCE.json';
	if (!existsSync(resolve(root, path))) fail(`${path} does not exist`);
	const evidence = readJson(root, path);
	validateV140ReleaseEvidence(evidence, {
		root,
		requireComplete: process.argv.includes('--complete')
	});
	console.log(
		`v1.4.0 release evidence passed${process.argv.includes('--complete') ? ' with complete P15-P20 status' : ''}.`
	);
}

if (process.argv[1]?.endsWith('verify-v140-release-evidence.mjs')) main();
