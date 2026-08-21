import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory() ? readFiles(entryPath) : [entryPath];
	});
}

const tokenPath = path.join(root, 'src/lib/styles/tokens.css');
const tokenSource = fs.readFileSync(tokenPath, 'utf8');
const componentFiles = [
	...readFiles(path.join(root, 'src/lib/components')),
	path.join(root, 'src/routes/+page.svelte'),
	path.join(root, 'src/routes/system/+page.svelte')
].filter((filePath) => /\.(css|svelte)$/.test(filePath));
const rawColourPattern = /#[0-9a-fA-F]{3,8}(?![A-Za-z0-9])|\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const forbiddenBusinessCallPattern = /\b(?:fetch|XMLHttpRequest|supabase|createClient)\b/;
const requiredTokens = [
	'--color-background',
	'--color-surface',
	'--color-border',
	'--color-text',
	'--color-brand-primary',
	'--color-brand-accent',
	'--color-success',
	'--color-warning',
	'--color-danger',
	'--color-info',
	'--pipeline-new',
	'--pipeline-qualification',
	'--pipeline-proposal',
	'--pipeline-decision',
	'--pipeline-won',
	'--pipeline-lost'
];

const failures = [];
for (const token of requiredTokens) {
	if (!tokenSource.includes(token)) failures.push(`Missing semantic token: ${token}`);
}

for (const filePath of componentFiles) {
	const source = fs.readFileSync(filePath, 'utf8');
	if (rawColourPattern.test(source)) {
		failures.push(
			`Literal colour found outside token definitions: ${path.relative(root, filePath)}`
		);
	}
	if (forbiddenBusinessCallPattern.test(source)) {
		failures.push(
			`Business API call found in the design-system scope: ${path.relative(root, filePath)}`
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join('\n'));
	process.exit(1);
}

console.log(`Design token compliance passed for ${componentFiles.length} source files.`);
