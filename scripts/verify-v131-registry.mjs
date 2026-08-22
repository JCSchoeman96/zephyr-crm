import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const expectedAuthorityFiles = [
	'AGENTS.md',
	'CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md',
	'DEPENDENCY_BASELINE_v1.0.0.md',
	'FILE_MANIFEST_v1.3.1.sha256',
	'PATCH_REGISTER_v1.3.1.md',
	'POST_BUILD_PILOT_PROGRAMME.md',
	'RELEASE_NOTES_v1.3.1.md',
	'VALIDATION_REPORT_v1.3.1.md',
	'Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.1.md',
	...Array.from({ length: 15 }, (_, index) => {
		const number = String(index).padStart(2, '0');
		return `Phases/PHASE_${number}_`;
	})
];

function fail(message) {
	throw new Error(`v1.3.1 authority registry: ${message}`);
}

for (const expected of expectedAuthorityFiles.slice(0, 9)) {
	if (!existsSync(expected)) fail(`missing authority file ${expected}`);
}
for (const prefix of expectedAuthorityFiles.slice(9)) {
	const phasePrefix = prefix.replace('Phases/', '');
	const matches = (await readdir('Phases'))
		.filter((file) => file.startsWith(phasePrefix) && file.endsWith('.md'))
		.sort();
	if (matches.length !== 1)
		fail(`expected one phase authority for ${prefix}, found ${matches.length}`);
}

const roadmap = await readFile('CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md', 'utf8');
if (
	!roadmap.includes('Version:** 1.3.1') ||
	!roadmap.includes('Cloudflare Workers with Static Assets')
) {
	fail('roadmap is not the v1.3.1 Workers authority');
}
const agents = await readFile('AGENTS.md', 'utf8');
if (!agents.includes('FINAL_PROJECT_VALIDATION') || !agents.includes('authority_sha256')) {
	fail('AGENTS.md does not contain the v1.3.1 final-gate/hash contract');
}

const phaseFiles = (await readdir('Phases'))
	.filter((file) => file.startsWith('PHASE_') && file.endsWith('.md'))
	.map((file) => `Phases/${file}`)
	.sort();
const requirements = [];
for (const file of phaseFiles) {
	const source = await readFile(file, 'utf8');
	for (const match of source.matchAll(/`(P\d+-T\d+)`/g)) requirements.push(match[1]);
}
const uniqueRequirements = [...new Set(requirements)];
if (uniqueRequirements.length !== 229) {
	fail(`expected 229 unique mandatory test IDs, found ${uniqueRequirements.length}`);
}
for (let phase = 0; phase <= 14; phase += 1) {
	const prefix = `P${phase}-`;
	const ids = uniqueRequirements.filter((id) => id.startsWith(prefix));
	if (ids.length === 0) fail(`phase P${phase} has no mandatory test IDs`);
	const expected = ids.map((id) => Number(id.slice(id.indexOf('-T') + 2))).sort((a, b) => a - b);
	for (let index = 0; index < expected.length; index += 1) {
		if (expected[index] !== index + 1) fail(`phase P${phase} test IDs are not contiguous`);
	}
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.packageManager !== 'bun@1.2.22')
	fail('packageManager is not the proven exact Bun version');
for (const [name, version] of Object.entries({
	...packageJson.dependencies,
	...packageJson.devDependencies
})) {
	if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		fail(`direct dependency ${name} is not exact-pinned`);
	}
}
if (
	!existsSync('bun.lock') ||
	['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].some(existsSync)
) {
	fail('lockfile authority is not exactly bun.lock');
}

const wrangler = await readFile('wrangler.jsonc', 'utf8');
for (const required of [
	'"main": ".svelte-kit/cloudflare/_worker.js"',
	'"assets"',
	'"directory": ".svelte-kit/cloudflare"',
	'"binding": "ASSETS"',
	'"compatibility_date"'
]) {
	if (!wrangler.includes(required)) fail(`wrangler.jsonc is missing ${required}`);
}
if (/pages_build_output_dir|Cloudflare Pages/.test(wrangler))
	fail('wrangler.jsonc still contains Pages architecture');

const packageLock = await readFile('package.json', 'utf8');
if (
	packageLock.includes('npm install') ||
	packageLock.includes('pnpm ') ||
	packageLock.includes('yarn ')
) {
	fail('package scripts introduce another package-manager authority');
}

console.log(
	'v1.3.1 authority registry passed: 15 phase authorities, 229 unique mandatory IDs, exact Bun/Workers toolchain.'
);
