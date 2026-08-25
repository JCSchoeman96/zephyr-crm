import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateEvidenceRegistry } from './verify-test-evidence.mjs';
import { validateReleaseManifest } from './verify-release-manifest.mjs';

const root = process.cwd();
const registryPath = 'docs/release/TEST_EVIDENCE.json';
const manifestPath = 'docs/release/RELEASE_MANIFEST.json';

function run(command) {
	const startedAt = Date.now();
	try {
		execFileSync('bash', ['-lc', command], {
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe'],
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: '1' }
		});
		return { command, status: 'PASS', exit_code: 0, duration_ms: Date.now() - startedAt };
	} catch (error) {
		return {
			command,
			status: 'FAIL',
			exit_code: typeof error.status === 'number' ? error.status : 1,
			duration_ms: Date.now() - startedAt
		};
	}
}

function metadata() {
	const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
	const bunVersion = execFileSync('bun', ['--version'], { cwd: root, encoding: 'utf8' }).trim();
	return {
		git_sha: gitSha,
		generated_at_utc: new Date().toISOString(),
		bun_version: bunVersion
	};
}

const args = new Set(process.argv.slice(2));
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath =
	outputArgument?.slice('--output='.length) ?? '.agent/goal-loop/RELEASE_EVIDENCE.json';
const registry = JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
validateEvidenceRegistry(registry);
validateReleaseManifest(manifest, { root });

const external = registry.entries
	.filter((entry) => entry.classification === 'EXTERNAL')
	.map((entry) => ({ id: entry.id, status: 'EXTERNAL', gate: entry.proof.gate }));
const historical = registry.entries
	.filter((entry) => entry.classification === 'HISTORICAL')
	.map((entry) => ({
		id: entry.id,
		status: 'HISTORICAL',
		boundary_commit: entry.proof.boundary_commit,
		implementation_start_commit: entry.proof.implementation_start_commit,
		limitation: entry.proof.limitation
	}));
const commands = [
	...new Set(
		registry.entries
			.filter((entry) => !['EXTERNAL', 'HISTORICAL'].includes(entry.classification))
			.map((entry) => entry.proof.command)
	)
];
if (args.has('--plan')) {
	console.log(
		JSON.stringify(
			{
				registry_version: registry.version,
				command_count: commands.length,
				commands,
				external,
				historical
			},
			null,
			2
		)
	);
	process.exit(0);
}

const results = commands.map(run);
const evidence = {
	version: 'v1.3.1',
	application_version: manifest.application_version,
	registry_path: registryPath,
	registry_count: registry.entries.length,
	...metadata(),
	commands: results,
	external,
	historical,
	status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL'
};
mkdirSync(resolve(root, dirname(outputPath)), { recursive: true });
writeFileSync(resolve(root, outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
if (evidence.status !== 'PASS') {
	throw new Error(`Release evidence execution failed; see ${outputPath}`);
}
console.log(
	`Release evidence execution passed for ${registry.entries.length} IDs at ${evidence.git_sha}.`
);
