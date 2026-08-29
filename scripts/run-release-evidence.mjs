import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateEvidenceRegistry } from './verify-test-evidence.mjs';
import { validateReleaseManifest } from './verify-release-manifest.mjs';
import { validateV140ReleaseEvidence } from './verify-v140-release-evidence.mjs';

const root = process.cwd();
const registryPath = 'docs/release/TEST_EVIDENCE.json';
const manifestPath = 'docs/release/RELEASE_MANIFEST.json';
const v140EvidencePath = 'docs/release/V1.4.0_RELEASE_EVIDENCE.json';
const v140Commands = [
	'bun run authority:v140:verify',
	'bun run test:v140:review-hardening',
	'bun run test:p16:persistence',
	'bun run test:p17:sales-fulfilment',
	'bun run test:unit -- --run src/lib/domain/sales/queues.spec.ts',
	'bun run test:p18:sales-queues',
	'bun run test:p19:fulfilment',
	'bun run test:p19:browser',
	'bun run test:p20:metrics',
	'bun run test:p20:browser',
	'bun run test:p20:reconciliation'
];

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function outputProof(stdout = '', stderr = '') {
	const output = [stdout, stderr].filter(Boolean).join('\n').trim();
	const safeExcerpt = (output || '(command produced no output)')
		.split('\n')
		.slice(-3)
		.join('\n')
		.replace(
			/(password|secret|token|service[_-]?role|authorization)\s*[:=]\s*[^\s,]+/gi,
			'$1=[redacted]'
		)
		.slice(-2000);
	return {
		output_sha256: sha256(output),
		output_bytes: Buffer.byteLength(output),
		output_excerpt: safeExcerpt
	};
}

function run(command) {
	const startedAt = Date.now();
	try {
		const stdout = execFileSync('bash', ['-lc', command], {
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe'],
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: '1' }
		});
		return {
			command,
			status: 'PASS',
			exit_code: 0,
			duration_ms: Date.now() - startedAt,
			...outputProof(stdout)
		};
	} catch (error) {
		return {
			command,
			status: 'FAIL',
			exit_code: typeof error.status === 'number' ? error.status : 1,
			duration_ms: Date.now() - startedAt,
			...outputProof(error.stdout?.toString(), error.stderr?.toString())
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

function runV140() {
	const evidence = JSON.parse(readFileSync(resolve(root, v140EvidencePath), 'utf8'));
	validateV140ReleaseEvidence(evidence, { root });
	const commands = v140Commands.map(run);
	const resultByCommand = new Map(commands.map((result) => [result.command, result]));
	const phaseEvidence = evidence.phase_evidence.map((entry) => {
		const result = resultByCommand.get(entry.command);
		return {
			...entry,
			status: result?.status ?? 'FAIL'
		};
	});
	const executionStatus = commands.every(
		(result) => result.status === 'PASS' && result.exit_code === 0
	)
		? 'PASS'
		: 'FAIL';
	const generated = {
		...evidence,
		generated_from: 'P15-P20 executed by scripts/run-release-evidence.mjs',
		phase_evidence: phaseEvidence,
		execution: {
			runner: 'scripts/run-release-evidence.mjs --v140',
			...metadata(),
			status: executionStatus,
			commands
		}
	};
	writeFileSync(resolve(root, v140EvidencePath), `${JSON.stringify(generated, null, '\t')}\n`);
	if (executionStatus !== 'PASS')
		throw new Error(`v1.4 release evidence execution failed; see ${v140EvidencePath}`);
	console.log(`v1.4 release evidence execution passed for ${commands.length} commands.`);
}

const args = new Set(process.argv.slice(2));
if (args.has('--v140')) {
	runV140();
	process.exit(0);
}
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
