import { readFile } from 'node:fs/promises';

const operations = await readFile('docs/OPERATIONS.md', 'utf8');
const contract = await readFile('docs/RECOVERY_CONTRACT.md', 'utf8');
const backup = await readFile('scripts/create-backup.mjs', 'utf8');
const restore = await readFile('scripts/restore-backup.mjs', 'utf8');
for (const text of [operations, contract, backup]) {
	for (const required of ['Storage', 'Auth', 'mfa', 'password', 'manifest', 'hash']) {
		if (!text.toLowerCase().includes(required.toLowerCase()))
			throw new Error(`recovery evidence is missing ${required}`);
	}
}
for (const required of ['manifest', 'hash', 'disposable']) {
	if (!restore.toLowerCase().includes(required.toLowerCase()))
		throw new Error(`restore implementation is missing ${required}`);
}
if (
	!operations.includes('mfa_reenrollment_required') ||
	!operations.includes('password_reset_or_reinvite_required')
) {
	throw new Error('recovery runbook does not state credential/factor reconstruction expectations');
}
if (!backup.includes('users-reconstruction.json') || !backup.includes('storage_objects')) {
	throw new Error('backup generator does not capture Auth reconstruction and Storage mapping');
}
if (!restore.includes('RESTORE_VERIFIED') || !restore.includes('BACKUP_RESTORE_DISPOSABLE')) {
	throw new Error('restore tool does not prove disposable recovery');
}
console.log(
	'v1.3.1 recovery evidence contract passed; P12/P14 runtime gates provide the encrypted disposable restore proof.'
);
