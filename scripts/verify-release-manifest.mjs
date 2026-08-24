import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
	throw new Error(`Release manifest: ${message}`);
}

function registryFromDisk(root, path) {
	try {
		return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
	} catch {
		fail(`mandatory registry file cannot be read: ${path}`);
	}
}

export function validateReleaseManifest(manifest, options = {}) {
	if (!manifest || typeof manifest !== 'object') fail('manifest must be an object');
	const root = options.root ?? process.cwd();
	const registryPath = manifest.mandatory_test_registry?.path ?? 'docs/release/TEST_EVIDENCE.json';
	const registryOnDisk = registryFromDisk(root, registryPath);
	const authorityVersion = registryOnDisk.version;
	if (manifest.version !== authorityVersion) {
		fail(`authority version must be ${authorityVersion}`);
	}
	if (!/^v1\.0\.0-rc\.\d+$/.test(manifest.application_version ?? '')) {
		fail('application_version must use v1.0.0-rc.N semantics');
	}
	if (manifest.application_version === 'v1.0.0')
		fail('stable production v1.0.0 is outside this local goal');
	if (manifest.authority_version !== authorityVersion) {
		fail(`authority_version must be ${authorityVersion}`);
	}
	const registry = manifest.mandatory_test_registry;
	if (!registry || registry.path !== 'docs/release/TEST_EVIDENCE.json')
		fail('tracked mandatory test registry path is missing');
	if (registry.version !== registryOnDisk.version || registry.count !== registryOnDisk.entry_count)
		fail(
			`mandatory registry must declare ${registryOnDisk.version} with ${registryOnDisk.entry_count} IDs`
		);
	if (!Array.isArray(manifest.expected_commands) || manifest.expected_commands.length === 0) {
		fail('expected_commands must contain the release commands');
	}
	const lifecycle = manifest.lifecycle;
	if (!lifecycle || !['NOT_READY', 'PILOT_READY'].includes(lifecycle.release_status))
		fail('release_status must be NOT_READY or PILOT_READY');
	if (lifecycle.goal_status === 'IN_PROGRESS') {
		if (lifecycle.execution_stage === 'PHASE_LOOP') {
			if (
				lifecycle.current_phase !== 'P14' ||
				lifecycle.phase_status !== 'VALIDATING' ||
				lifecycle.local_build_status !== 'FINAL_VALIDATION_PENDING' ||
				lifecycle.release_status !== 'NOT_READY'
			)
				fail('P14 phase-loop lifecycle projection is invalid');
		} else if (lifecycle.execution_stage === 'FINAL_PROJECT_VALIDATION') {
			if (
				lifecycle.current_phase !== 'P14' ||
				lifecycle.phase_status !== 'COMPLETE' ||
				lifecycle.local_build_status !== 'FINAL_VALIDATION_PENDING' ||
				lifecycle.release_status !== 'NOT_READY'
			)
				fail('final-validation lifecycle projection is invalid');
		} else {
			fail('non-terminal lifecycle execution_stage is invalid');
		}
	} else if (lifecycle.goal_status === 'COMPLETE') {
		if (
			lifecycle.execution_stage !== 'COMPLETE' ||
			lifecycle.current_phase !== 'P14' ||
			lifecycle.phase_status !== 'COMPLETE' ||
			lifecycle.local_build_status !== 'LOCAL_BUILD_COMPLETE' ||
			lifecycle.release_status !== 'PILOT_READY'
		)
			fail('terminal lifecycle projection is invalid');
	} else {
		fail('goal_status must be IN_PROGRESS or COMPLETE');
	}
	if (lifecycle.pilot_status !== 'NOT_STARTED') fail('pilot_status must remain NOT_STARTED');
	if (lifecycle.production_status !== 'NOT_LAUNCHED')
		fail('production_status must remain NOT_LAUNCHED');
	if (manifest.git_sha !== 'GENERATED_AT_VALIDATION')
		fail('git_sha must be generated from the exact validated checkout');
	if (manifest.release_evidence_path !== '.agent/goal-loop/RELEASE_EVIDENCE.json') {
		fail('release evidence path is missing');
	}
	if (options.root) {
		if (!existsSync(resolve(options.root, registry.path)))
			fail('mandatory registry file does not exist');
	}
	return true;
}

if (process.argv[1] && process.argv[1].endsWith('verify-release-manifest.mjs')) {
	const path = process.argv[2] ?? 'docs/release/RELEASE_MANIFEST.json';
	const manifest = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
	validateReleaseManifest(manifest, { root: process.cwd() });
	console.log(
		'Release manifest passed: v1.0.0-rc.1 / current authority / dynamic mandatory ID set.'
	);
}
