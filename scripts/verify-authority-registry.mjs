import { existsSync, readFileSync, readdirSync } from 'node:fs';

const phaseCount = 15;
const requiredRoots = [
	'AGENTS.md',
	'CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md',
	'DEPENDENCY_BASELINE_v1.0.1.md',
	'POST_BUILD_PILOT_PROGRAMME.md',
	'Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.2.md',
	'docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md'
];

function fail(message) {
	throw new Error(`v1.3.2 authority registry: ${message}`);
}

for (const path of requiredRoots) if (!existsSync(path)) fail(`missing authority file ${path}`);

const phaseFiles = readdirSync('Phases')
	.filter((file) => file.startsWith('PHASE_') && file.endsWith('.md'))
	.sort();
if (phaseFiles.length !== phaseCount)
	fail(`expected ${phaseCount} phase authorities, found ${phaseFiles.length}`);

for (let phase = 0; phase < phaseCount; phase += 1) {
	const prefix = `PHASE_${String(phase).padStart(2, '0')}_`;
	const matches = phaseFiles.filter((file) => file.startsWith(prefix));
	if (matches.length !== 1)
		fail(`expected one phase authority for ${prefix}, found ${matches.length}`);
	const source = readFileSync(`Phases/${matches[0]}`, 'utf8');
	if (!source.includes('Roadmap Version:** 1.3.2'))
		fail(`${matches[0]} is not reconciled to roadmap 1.3.2`);
}

const roadmap = readFileSync('CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md', 'utf8');
if (!roadmap.includes('Version:** 1.3.2') || !roadmap.includes('ZH-001')) {
	fail('roadmap is missing the v1.3.2 hardening amendment');
}
const hardening = readFileSync(
	'docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md',
	'utf8'
);
if (!hardening.includes('P14-T35') || !hardening.includes('ZH-018'))
	fail('frozen hardening authority is incomplete');

const requirements = [];
for (const file of phaseFiles) {
	const source = readFileSync(`Phases/${file}`, 'utf8');
	for (const match of source.matchAll(/`(P\d+-T\d+)`/g)) requirements.push(match[1]);
}
const uniqueRequirements = [...new Set(requirements)];
if (uniqueRequirements.length === 0) fail('no mandatory test IDs found');
for (let phase = 0; phase < phaseCount; phase += 1) {
	const ids = uniqueRequirements.filter((id) => id.startsWith(`P${phase}-`));
	if (ids.length === 0) fail(`phase P${phase} has no mandatory test IDs`);
	const numbers = ids.map((id) => Number(id.slice(id.indexOf('-T') + 2))).sort((a, b) => a - b);
	for (let index = 0; index < numbers.length; index += 1) {
		if (numbers[index] !== index + 1) fail(`phase P${phase} test IDs are not contiguous`);
	}
}
for (let number = 22; number <= 35; number += 1) {
	if (!uniqueRequirements.includes(`P14-T${number}`)) fail(`P14-T${number} is missing`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.packageManager !== 'bun@1.2.22')
	fail('packageManager is not the proven exact Bun version');
for (const [name, version] of Object.entries({
	...packageJson.dependencies,
	...packageJson.devDependencies
})) {
	if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
		fail(`direct dependency ${name} is not exact-pinned`);
}
if (
	!existsSync('bun.lock') ||
	['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].some(existsSync)
)
	fail('lockfile authority is not exactly bun.lock');

const wrangler = readFileSync('wrangler.jsonc', 'utf8');
for (const required of [
	'"main": ".svelte-kit/cloudflare/_worker.js"',
	'"assets"',
	'"directory": ".svelte-kit/cloudflare"',
	'"binding": "ASSETS"',
	'"compatibility_date"'
])
	if (!wrangler.includes(required)) fail(`wrangler.jsonc is missing ${required}`);
if (/pages_build_output_dir|Cloudflare Pages/.test(wrangler))
	fail('wrangler.jsonc still contains Pages architecture');

console.log(
	`v1.3.2 authority registry passed: ${phaseCount} phase authorities, ${uniqueRequirements.length} unique mandatory IDs, exact Bun/Workers toolchain.`
);
