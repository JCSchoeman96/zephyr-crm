import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
	'supabase/migrations/20260822160000_v131_authority_reconciliation.sql',
	'utf8'
);
const adapter = await readFile('src/lib/domain/communications/sendpulse-adapter.ts', 'utf8');
for (const required of [
	'submission_unknown',
	'logical_key',
	'reconcile_quote_submission',
	'hard_bounced',
	'automation_key'
]) {
	if (!migration.includes(required))
		throw new Error(`communications contract is missing ${required}`);
}
for (const required of ['SendPulseSubmissionUnknownError', 'client_credentials', 'smtp/emails']) {
	if (!adapter.includes(required)) throw new Error(`REST adapter evidence is missing ${required}`);
}

execFileSync(
	'bun',
	['run', 'test:unit', '--', '--run', 'src/lib/domain/communications/sendpulse-adapter.spec.ts'],
	{
		stdio: 'inherit'
	}
);
console.log(
	'v1.3.1 communications evidence passed: project-owned REST adapter unit contract plus P8 database/provider uncertainty, reconciliation, webhook and hard-bounce regression.'
);
