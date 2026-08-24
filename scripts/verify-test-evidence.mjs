import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const evidenceClassifications = new Set([
	'AUTOMATED',
	'STATIC',
	'COMPOSED',
	'EXTERNAL',
	'HISTORICAL'
]);

function authorityVersion(root) {
	const hashes = JSON.parse(readFileSync(resolve(root, 'docs/AUTHORITY_HASHES.json'), 'utf8'));
	if (typeof hashes.version !== 'string' || hashes.version.trim() === '') {
		fail('authority hash registry version is missing');
	}
	return hashes.version;
}

function fail(message) {
	throw new Error(`Release evidence registry: ${message}`);
}

function expectedAuthorityIds(root) {
	const ids = [];
	for (const file of readdirSync(resolve(root, 'Phases')).filter((file) =>
		/^PHASE_\d+_.+\.md$/.test(file)
	)) {
		const source = readFileSync(resolve(root, 'Phases', file), 'utf8');
		for (const match of source.matchAll(/`(P\d+-T\d+)`/g)) ids.push(match[1]);
	}
	return [...new Set(ids)].sort((left, right) => {
		const [leftPhase, leftTest] = left.slice(1).split('-T').map(Number);
		const [rightPhase, rightTest] = right.slice(1).split('-T').map(Number);
		return leftPhase - rightPhase || leftTest - rightTest;
	});
}

function sourceText(root, source) {
	if (typeof source !== 'string' || source.trim() === '') fail('local proof source is required');
	const path = resolve(root, source);
	if (!existsSync(path)) fail(`local proof source does not exist: ${source}`);
	return readFileSync(path, 'utf8');
}

function validateStaticProof(entry, root) {
	const proof = entry.proof;
	const sources = Array.isArray(proof.sources)
		? proof.sources
		: [{ source: proof.source, contains: proof.contains }];
	if (sources.length === 0) fail(`${entry.id} requires deterministic content assertions`);
	for (const candidate of sources) {
		const source = sourceText(root, candidate.source);
		if (!Array.isArray(candidate.contains) || candidate.contains.length === 0) {
			fail(`${entry.id} requires deterministic content assertions`);
		}
		for (const token of candidate.contains) {
			if (typeof token !== 'string' || token.trim() === '' || !source.includes(token)) {
				fail(`${entry.id} content assertion is absent from ${candidate.source}`);
			}
		}
	}
}

function validateHistoricalProof(entry) {
	const proof = entry.proof;
	if (!proof || typeof proof !== 'object') fail(`${entry.id} is missing proof metadata`);
	if (proof.kind !== 'git-boundary') fail(`${entry.id} requires a Git boundary proof`);
	if (typeof proof.command !== 'string' || proof.command.trim() === '') {
		fail(`${entry.id} requires the historical review command`);
	}
	for (const field of ['boundary_commit', 'implementation_start_commit']) {
		if (!/^[0-9a-f]{40}$/.test(proof[field] ?? '')) {
			fail(`${entry.id} requires a full commit hash for ${field}`);
		}
	}
	if (!Array.isArray(proof.boundary_files) || proof.boundary_files.length === 0) {
		fail(`${entry.id} requires the reviewed historical boundary files`);
	}
	if (
		typeof proof.limitation !== 'string' ||
		!/Historical Git provenance is reviewed manually/.test(proof.limitation)
	) {
		fail(`${entry.id} must disclose the manual historical-proof limitation`);
	}
}

function validateLocalProof(entry, root) {
	const proof = entry.proof;
	if (!proof || typeof proof !== 'object') fail(`${entry.id} is missing proof metadata`);
	if (typeof proof.command !== 'string' || proof.command.trim() === '') {
		fail(`${entry.id} requires an exact executable command`);
	}
	if (entry.classification === 'STATIC') {
		validateStaticProof(entry, root);
		return;
	}
	const source = sourceText(root, proof.source);
	if (typeof proof.assertion !== 'string' || proof.assertion.trim() === '') {
		fail(`${entry.id} requires an exact assertion`);
	}
	if (
		/quality passed|non-empty|length\s*>\s*0|console\.log|^assert\(\s*$|!condition|!response\.ok\b|Error\(message\)/i.test(
			proof.assertion
		)
	) {
		fail(`${entry.id} uses a ceremonial assertion`);
	}
	if (!source.includes(proof.assertion)) {
		fail(`${entry.id} exact assertion is absent from ${proof.source}`);
	}
	if (entry.classification === 'COMPOSED') {
		if (!Array.isArray(proof.components) || proof.components.length === 0) {
			fail(`${entry.id} composed proof requires component IDs`);
		}
	}
}

export function validateEvidenceRegistry(registry, options = {}) {
	const root = options.root ?? process.cwd();
	const expectedIds = options.expectedIds ?? expectedAuthorityIds(root);
	const expectedVersion = options.version ?? authorityVersion(root);
	if (!registry || registry.version !== expectedVersion) {
		fail(`version must be ${expectedVersion}`);
	}
	if (!Array.isArray(registry.entries)) fail('entries must be an array');
	const entries = new Map();
	for (const entry of registry.entries) {
		if (!entry || typeof entry.id !== 'string' || !/^P\d+-T\d+$/.test(entry.id)) {
			fail('every entry needs a valid mandatory test ID');
		}
		if (entries.has(entry.id)) fail(`duplicate ID ${entry.id}`);
		if (!evidenceClassifications.has(entry.classification)) {
			fail(`${entry.id} has an invalid evidence classification`);
		}
		if (entry.classification === 'EXTERNAL') {
			if (entry.status === 'PASS' || entry.proof?.localPass === true) {
				fail(`${entry.id} external evidence cannot be recorded as local PASS`);
			}
			if (typeof entry.proof?.gate !== 'string' || entry.proof.gate.trim() === '') {
				fail(`${entry.id} external evidence requires a named gate`);
			}
		} else if (entry.classification === 'HISTORICAL') {
			validateHistoricalProof(entry);
		} else {
			validateLocalProof(entry, root);
		}
		entries.set(entry.id, entry);
	}
	const actualIds = [...entries.keys()].sort();
	if (registry.entries.length !== expectedIds.length) {
		const missing = expectedIds.filter((id) => !entries.has(id));
		const unexpected = actualIds.filter((id) => !expectedIds.includes(id));
		fail(
			`expected ${expectedIds.length} entries, found ${registry.entries.length}; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`
		);
	}
	if (JSON.stringify(actualIds) !== JSON.stringify([...expectedIds].sort())) {
		const missing = expectedIds.filter((id) => !entries.has(id));
		const unexpected = actualIds.filter((id) => !expectedIds.includes(id));
		fail(
			`mandatory ID set drifted; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`
		);
	}
	for (const entry of entries.values()) {
		if (entry.classification === 'COMPOSED') {
			for (const component of entry.proof.components) {
				if (!entries.has(component)) fail(`${entry.id} references missing component ${component}`);
				if (component === entry.id) fail(`${entry.id} cannot compose itself`);
			}
		}
	}
	return {
		count: entries.size,
		external: [...entries.values()].filter((entry) => entry.classification === 'EXTERNAL').length
	};
}

if (process.argv[1] && process.argv[1].endsWith('verify-test-evidence.mjs')) {
	const registryPath = process.argv[2] ?? 'docs/release/TEST_EVIDENCE.json';
	const registry = JSON.parse(readFileSync(resolve(process.cwd(), registryPath), 'utf8'));
	const result = validateEvidenceRegistry(registry);
	console.log(
		`Release evidence registry passed: ${result.count} IDs, ${result.external} external gates.`
	);
}
