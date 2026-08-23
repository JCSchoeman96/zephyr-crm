import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
	throw new Error(`Release manifest: ${message}`);
}

export function validateReleaseManifest(manifest, options = {}) {
	if (!manifest || typeof manifest !== 'object') fail('manifest must be an object');
	if (manifest.version !== 'v1.3.1') fail('authority version must be v1.3.1');
	if (!/^v1\.0\.0-rc\.\d+$/.test(manifest.application_version ?? '')) {
		fail('application_version must use v1.0.0-rc.N semantics');
	}
	if (manifest.application_version === 'v1.0.0')
		fail('stable production v1.0.0 is outside this local goal');
	if (manifest.authority_version !== 'v1.3.1') fail('authority_version must be v1.3.1');
	const registry = manifest.mandatory_test_registry;
	if (!registry || registry.path !== 'docs/release/TEST_EVIDENCE.json')
		fail('tracked mandatory test registry path is missing');
	if (registry.version !== 'v1.3.1' || registry.count !== 229)
		fail('mandatory registry must declare v1.3.1 with 229 IDs');
	if (!Array.isArray(manifest.expected_commands) || manifest.expected_commands.length === 0) {
		fail('expected_commands must contain the release commands');
	}
	const lifecycle = manifest.lifecycle;
	if (!lifecycle || lifecycle.release_status !== 'PILOT_READY')
		fail('release_status must be PILOT_READY');
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
	console.log('Release manifest passed: v1.0.0-rc.1 / v1.3.1 / 229 mandatory IDs.');
}
