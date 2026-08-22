import { readdir, readFile, writeFile } from 'node:fs/promises';

const phaseFiles = (await readdir('Phases'))
	.filter((file) => file.startsWith('PHASE_') && file.endsWith('.md'))
	.map((file) => `Phases/${file}`)
	.sort();
const evidence = {
	P0: 'docs/ARCHITECTURE.md, docs/DOMAIN_MODEL.md, docs/STATE_MACHINES.md, docs/SECURITY_MODEL.md and reconciliation contracts',
	P1: 'docs/TOOLCHAIN_PROOF.md; format/check/lint/unit/browser/build and frozen install gates',
	P2: 'components.json, Tailwind 4 source, project-owned UI components and unit/static gates',
	P3: 'bun run db:reset; bun run db:security; migration/static security inspection',
	P4: 'bun run test:p4:domain and bun run test:p4:tracer',
	P5: 'bun run test:p5:leads',
	P6: 'bun run test:p6:clients',
	P7: 'bun run test:p7:quotes and exact money/document unit tests',
	P8: 'bun run test:p8:documents and v1.3.1 communications regression',
	P9: 'bun run test:p9:automation',
	P10: 'bun run test:p10:analytics and docs/METRICS_CONTRACT.md',
	P11: 'bun run test:p11:hardening and browser/performance checks',
	P12: 'bun run test:p12:hardening, security audit, privacy and recovery contracts',
	P13: 'bun run test:p13:template and Workers artifact checks',
	P14: 'global final validation, authority drift/toolchain/recovery/communications gates'
};

function cells(line) {
	return line
		.split('|')
		.slice(1, -1)
		.map((cell) => cell.trim());
}

const rows = [];
for (const file of phaseFiles) {
	const source = await readFile(file, 'utf8');
	const phase = file.match(/PHASE_(\d+)/)?.[1];
	for (const line of source.split('\n')) {
		if (!line.includes('`P') || !/-T\d+`/.test(line)) continue;
		const columns = cells(line);
		if (columns.length < 4) continue;
		const id = columns[0].replaceAll('`', '');
		if (!/^P\d+-T\d+$/.test(id)) continue;
		rows.push({
			id,
			name: columns[1],
			type: columns[2],
			criterion: columns.slice(3).join(' | '),
			evidence: evidence[`P${Number(phase)}`]
		});
	}
}

const unique = new Map(rows.map((row) => [row.id, row]));
if (unique.size !== 229) throw new Error(`Expected 229 coverage rows, found ${unique.size}`);
const ordered = [...unique.values()].sort((a, b) => {
	const [ap, at] = a.id.replace('P', '').split('-T').map(Number);
	const [bp, bt] = b.id.replace('P', '').split('-T').map(Number);
	return ap - bp || at - bt;
});

const output = [
	'# v1.3.1 mandatory requirements coverage',
	'',
	'Generated from the frozen `Phases/PHASE_00` through `PHASE_14` authorities. The registry contains 229 unique mandatory test IDs: the old v1.1 baseline had 156, so the exact authority delta is 73 added, 0 removed, and 0 renumbered. Each row is a frozen acceptance requirement; the evidence column names the authoritative local proof.',
	'',
	'| ID | Mandatory test | Type | Exact pass criterion | Evidence |',
	'| --- | --- | --- | --- | --- |',
	...ordered.map(
		(row) => `| \`${row.id}\` | ${row.name} | ${row.type} | ${row.criterion} | ${row.evidence} |`
	),
	'',
	'## Coverage rules',
	'',
	'- Completed-phase mandatory IDs are frozen regression gates; none may be deleted, renumbered, weakened, or silently skipped.',
	'- A local fixture or mock proves only the internal contract it exercises; it is not represented as live provider, DNS, hosted deployment, or human-pilot evidence.',
	'- The terminal state is recorded only after the separate global final validation, not merely when P14 focused checks pass.'
].join('\n');
await writeFile('docs/REQUIREMENTS_COVERAGE.md', `${output}\n`);
console.log(
	`Generated docs/REQUIREMENTS_COVERAGE.md with ${ordered.length} v1.3.1 mandatory requirements.`
);
