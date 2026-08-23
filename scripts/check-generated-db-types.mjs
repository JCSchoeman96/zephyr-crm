import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const trackedTypesPath = resolve(root, 'src/lib/types/database.ts');

export function typeDriftMessage(generated, tracked) {
	if (generated === tracked) return null;
	const generatedLines = generated.split('\n');
	const trackedLines = tracked.split('\n');
	const firstDifferentLine = Math.max(
		1,
		Array.from(
			{ length: Math.max(generatedLines.length, trackedLines.length) },
			(_, index) => index + 1
		).find((line) => generatedLines[line - 1] !== trackedLines[line - 1]) ?? 1
	);
	const start = Math.max(1, firstDifferentLine - 2);
	const end = Math.min(
		Math.max(generatedLines.length, trackedLines.length),
		firstDifferentLine + 2
	);
	const context = [];
	for (let line = start; line <= end; line += 1) {
		context.push(
			`line ${line}: generated=${JSON.stringify(generatedLines[line - 1] ?? '')} tracked=${JSON.stringify(trackedLines[line - 1] ?? '')}`
		);
	}
	return `Generated database types drifted from ${trackedTypesPath}; first difference at line ${firstDifferentLine}.\n${context.join('\n')}`;
}

export function assertGeneratedTypesMatch(generated, tracked) {
	const message = typeDriftMessage(generated, tracked);
	if (message) throw new Error(message);
}

function generateTypes(outputPath) {
	const generated = execFileSync(
		'bunx',
		['supabase', 'gen', 'types', 'typescript', '--local', '--schema', 'public'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
	);
	writeFileSync(outputPath, generated);
	execFileSync('bunx', ['prettier', '--config', './prettier.config.js', '--write', outputPath], {
		cwd: root,
		stdio: ['ignore', 'ignore', 'pipe']
	});
}

if (process.argv[1] && process.argv[1].endsWith('check-generated-db-types.mjs')) {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'zephyr-crm-db-types-'));
	const generatedPath = join(temporaryDirectory, 'database.ts');
	try {
		generateTypes(generatedPath);
		assertGeneratedTypesMatch(
			readFileSync(generatedPath, 'utf8'),
			readFileSync(trackedTypesPath, 'utf8')
		);
		console.log(
			'Generated Supabase public types match src/lib/types/database.ts without mutating tracked files.'
		);
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}
