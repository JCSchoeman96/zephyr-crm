import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const toolchainProof = readFileSync('docs/TOOLCHAIN_PROOF.md', 'utf8');
const wrangler = readFileSync('wrangler.jsonc', 'utf8');

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

const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
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

console.log('P1 toolchain contract passed.');
