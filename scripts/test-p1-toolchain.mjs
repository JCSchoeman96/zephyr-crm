import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const toolchainProof = readFileSync('docs/TOOLCHAIN_PROOF.md', 'utf8');
const wrangler = readFileSync('wrangler.jsonc', 'utf8');
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function sourceFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? sourceFiles(path)
			: /\.(?:svelte|ts)$/.test(entry.name)
				? [path]
				: [];
	});
}

function directNodeScriptInvocations() {
	const violations = [];
	const directNodeScriptPattern = /\bnode\s+(?:\.\/)?scripts\//;

	for (const [name, command] of Object.entries(packageJson.scripts)) {
		if (directNodeScriptPattern.test(command)) {
			violations.push(`package.json#scripts.${name}: ${command}`);
		}
	}

	for (const match of playwrightConfig.matchAll(/command:\s*['"]([^'"]+)['"]/g)) {
		if (directNodeScriptPattern.test(match[1])) {
			violations.push(`playwright.config.ts: ${match[1]}`);
		}
	}

	for (const workflow of readdirSync('.github/workflows')) {
		const path = join('.github/workflows', workflow);
		const source = readFileSync(path, 'utf8');
		for (const line of source.split('\n')) {
			if (/\brun:\s*node\s+(?:\.\/)?scripts\//.test(line)) {
				violations.push(`${path}: ${line.trim()}`);
			}
		}
	}

	for (const path of readdirSync('scripts')
		.filter((candidate) => candidate.endsWith('.mjs'))
		.map((candidate) => join('scripts', candidate))) {
		const source = readFileSync(path, 'utf8');
		if (/\bcommand\s*:\s*['"]\s*node\s+(?:\.\/)?scripts\//.test(source)) {
			violations.push(`${path}: configured direct node scripts command`);
		}
		if (
			/(?:execFileSync|execFile|spawn|spawnSync|execSync|exec)\(\s*['"]node['"]/.test(source) ||
			/(?:execSync|exec)\(\s*['"][^'"]*\bnode\s+(?:\.\/)?scripts\//.test(source) ||
			/Bun\.spawn\(\s*\[\s*['"]node['"]/.test(source)
		) {
			violations.push(`${path}: direct node child-process runtime`);
		}
	}

	return violations;
}

const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
const runtimeViolations = directNodeScriptInvocations();
assert(
	runtimeViolations.length === 0,
	[
		'Project-owned executable scripts must run through the repository Bun runtime.',
		...runtimeViolations
	].join('\n')
);
assert(
	dependencies['@lucide/svelte'] === '1.33.0',
	'@lucide/svelte must be exact-pinned at the proven stable version 1.33.0.'
);
assert(!('lucide-svelte' in dependencies), 'Deprecated lucide-svelte must not remain installed.');

const applicationSources = sourceFiles('src')
	.map((path) => readFileSync(path, 'utf8'))
	.join('\n');
assert(
	!applicationSources.includes("from 'lucide-svelte'") &&
		!applicationSources.includes('from "lucide-svelte"'),
	'Application imports must not use deprecated lucide-svelte.'
);
assert(
	applicationSources.includes("from '@lucide/svelte'"),
	'Application must use @lucide/svelte.'
);

for (const required of ['vitest', '@playwright/test', 'svelte-check', 'eslint', 'prettier']) {
	assert(
		required in dependencies || packageJson.scripts[required],
		`Approved ${required} tool is missing.`
	);
}

const packageText = JSON.stringify(packageJson).toLowerCase();
for (const prohibited of ['jest', 'cypress', 'react-icons', '@fortawesome']) {
	assert(
		!packageText.includes(prohibited),
		`Prohibited parallel tool or icon system found: ${prohibited}`
	);
}
assert(
	toolchainProof.includes('| Lucide | `@lucide/svelte 1.33.0` |'),
	'Toolchain proof must record the exact proven @lucide/svelte version.'
);
assert(!existsSync('wrangler.toml'), 'A competing wrangler.toml configuration must not exist.');
assert(
	wrangler.includes('"compatibility_date": "2026-08-21"') &&
		wrangler.includes('"main": ".svelte-kit/cloudflare/_worker.js"'),
	'Workers configuration must keep the frozen compatibility date and Worker artifact.'
);
assert(
	wrangler.includes('"ZEPHYR_COMPONENT_LAB_ENABLED": "0"'),
	'Workers configuration must keep Component Lab disabled by default; local preview may override it through the secure env file.'
);

for (const binding of [
	'BRICKS_FORM_ID',
	'SENDPULSE_API_BASE_URL',
	'SENDPULSE_SENDER_EMAIL',
	'SENDPULSE_SENDER_NAME'
]) {
	assert(
		wrangler.includes(`"${binding}":`),
		`Workers configuration must declare ${binding} so the secure local preview env file can bind it.`
	);
}

for (const binding of [
	'SENDPULSE_API_BASE_URL',
	'SENDPULSE_SENDER_EMAIL',
	'SENDPULSE_SENDER_NAME'
]) {
	assert(
		wrangler.includes(`"${binding}": ""`),
		`Workers configuration must keep ${binding} empty by default; local preview values come from the secure env file.`
	);
}

console.log('P1 toolchain contract passed.');
