import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const authorityVersion = 'v1.3.2';

const rootAuthorityFiles = [
	'AGENTS.md',
	'CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md',
	'DEPENDENCY_BASELINE_v1.0.0.md',
	'DEPENDENCY_BASELINE_v1.0.1.md',
	'FILE_MANIFEST_v1.3.1.sha256',
	'PATCH_REGISTER_v1.3.1.md',
	'POST_BUILD_PILOT_PROGRAMME.md',
	'RELEASE_NOTES_v1.3.1.md',
	'VALIDATION_REPORT_v1.3.1.md',
	'Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.2.md',
	'docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md'
];
const normativeDocs = [
	'docs/ARCHITECTURE.md',
	'docs/DOMAIN_MODEL.md',
	'docs/STATE_MACHINES.md',
	'docs/SECURITY_MODEL.md',
	'docs/MONEY_CONTRACT.md',
	'docs/METRICS_CONTRACT.md',
	'docs/PRIVACY_OPERATIONS.md',
	'docs/RECOVERY_CONTRACT.md',
	'docs/ROADMAP.md',
	'docs/TOOLCHAIN_PROOF.md',
	'docs/OPERATIONS.md',
	'docs/CLIENT_DEPLOYMENT.md',
	'docs/PILOT_READINESS.md'
];
const stateHashPath = 'docs/AUTHORITY_HASHES.json';

async function authorityPaths() {
	const phaseFiles = (await readdir('Phases'))
		.filter((file) => file.startsWith('PHASE_') && file.endsWith('.md'))
		.map((file) => `Phases/${file}`)
		.sort();
	return [...rootAuthorityFiles, ...normativeDocs, ...phaseFiles];
}

async function hash(path) {
	return createHash('sha256')
		.update(await readFile(path))
		.digest('hex');
}

const paths = await authorityPaths();
for (const path of paths) {
	if (!existsSync(path)) throw new Error(`Missing frozen authority ${path}`);
}

const current = Object.fromEntries(
	await Promise.all(paths.map(async (path) => [path, await hash(path)]))
);

if (process.argv.includes('--write')) {
	await writeFile(
		stateHashPath,
		`${JSON.stringify({ version: authorityVersion, files: current }, null, 2)}\n`
	);
	console.log(
		`Authority hashes intentionally regenerated for ${paths.length} ${authorityVersion} files.`
	);
	process.exit(0);
}

if (!existsSync(stateHashPath))
	throw new Error(`Missing ${stateHashPath}; run the intentional hash regeneration step.`);
const recorded = JSON.parse(await readFile(stateHashPath, 'utf8'));
if (recorded.version !== authorityVersion)
	throw new Error(`Authority hash registry is not ${authorityVersion}.`);
const expectedPaths = Object.keys(current);
const recordedPaths = Object.keys(recorded.files ?? {}).sort();
if (JSON.stringify(expectedPaths.slice().sort()) !== JSON.stringify(recordedPaths)) {
	throw new Error('Authority hash registry file set drifted; do not silently replace it.');
}
for (const path of expectedPaths) {
	if (recorded.files[path] !== current[path]) {
		throw new Error(
			`Authority drift detected in ${path}: recorded ${recorded.files[path]}, current ${current[path]}`
		);
	}
}
console.log(
	`Authority hash verification passed for ${expectedPaths.length} ${authorityVersion} files.`
);
