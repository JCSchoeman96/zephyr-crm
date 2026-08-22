import { createDecipheriv, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const envelopeHeader = Buffer.from('ZEPHYR-CRM-BACKUP-1\0');

function run(command, args) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	} catch {
		throw new Error(`${command} failed during the disposable restore`);
	}
}

function parseKey(value) {
	const trimmed = value.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex');
	const base64 = Buffer.from(trimmed, 'base64');
	if (base64.length === 32) return base64;
	throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hex or base64 secret');
}

async function sha256File(path) {
	return await new Promise((resolveHash, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(path);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolveHash(hash.digest('hex')));
	});
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
	const archivePath = process.argv[2];
	if (!archivePath) throw new Error('Usage: bun run backup:restore -- <encrypted-backup>');
	const databaseUrl = process.env.BACKUP_RESTORE_DATABASE_URL?.trim();
	if (!databaseUrl)
		throw new Error('BACKUP_RESTORE_DATABASE_URL is required for a disposable restore');
	if (process.env.BACKUP_RESTORE_DISPOSABLE !== 'true') {
		throw new Error('Set BACKUP_RESTORE_DISPOSABLE=true to acknowledge a disposable target');
	}
	const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY ?? '');
	const encrypted = await readFile(archivePath);
	if (!encrypted.subarray(0, envelopeHeader.length).equals(envelopeHeader)) {
		throw new Error('Unsupported backup envelope');
	}
	const ivStart = envelopeHeader.length;
	const iv = encrypted.subarray(ivStart, ivStart + 12);
	const tag = encrypted.subarray(ivStart + 12, ivStart + 28);
	const ciphertext = encrypted.subarray(ivStart + 28);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

	const restoreRoot = join(tmpdir(), `zephyr-crm-restore-${Date.now()}-${process.pid}`);
	const tarPath = join(tmpdir(), `zephyr-crm-restore-${Date.now()}-${process.pid}.tar.gz`);
	try {
		await mkdir(restoreRoot, { recursive: true });
		await writeFile(tarPath, plaintext, { mode: 0o600 });
		run('tar', ['-xzf', tarPath, '-C', restoreRoot]);
		const manifest = JSON.parse(await readFile(join(restoreRoot, 'manifest.json'), 'utf8'));
		if (manifest.format !== 'zephyr-crm-backup' || manifest.version !== 1) {
			throw new Error('Unsupported Zephyr backup manifest');
		}
		for (const entry of manifest.files ?? []) {
			const path = join(restoreRoot, ...String(entry.path).split('/'));
			const actual = await sha256File(path);
			const bytes = (await stat(path)).size;
			if (actual !== entry.sha256 || bytes !== entry.bytes) {
				throw new Error(`Backup integrity check failed for ${entry.path}`);
			}
		}

		const authUsers = JSON.parse(
			await readFile(join(restoreRoot, 'auth', 'users-reconstruction.json'), 'utf8')
		);
		const bootstrapPath = join(restoreRoot, 'database', 'restore-bootstrap.sql');
		const userRows = authUsers
			.filter((user) => user?.id)
			.map(
				(user) =>
					`insert into auth.users (id) values (${sqlLiteral(user.id)}::uuid) on conflict do nothing;`
			)
			.join('\n');
		await writeFile(
			bootstrapPath,
			[
				'create schema if not exists auth;',
				'create table if not exists auth.users (id uuid primary key);',
				'create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;',
				"create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;",
				userRows
			].join('\n') + '\n'
		);
		run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', bootstrapPath]);
		run('psql', [
			databaseUrl,
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			join(restoreRoot, 'database', 'schema.sql')
		]);
		run('psql', [
			databaseUrl,
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-c',
			'set session_replication_role = replica;',
			'-f',
			join(restoreRoot, 'database', 'data.sql')
		]);

		const counts = run('psql', [
			databaseUrl,
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-At',
			'-c',
			"select json_build_object('profiles', (select count(*) from public.profiles), 'lead_sources', (select count(*) from public.lead_sources), 'app_settings', (select count(*) from public.app_settings))::text;"
		]);
		if (!counts.includes('profiles') || !counts.includes('app_settings')) {
			throw new Error('Restored application integrity counts were not returned');
		}
		console.log(
			JSON.stringify({
				status: 'RESTORE_VERIFIED',
				backup_id: manifest.backup_id,
				files_verified: manifest.files.length,
				storage_objects_verified: (manifest.storage_objects ?? []).length,
				identity_policy: manifest.auth_recovery
			})
		);
	} finally {
		await rm(restoreRoot, { recursive: true, force: true });
		await rm(tarPath, { force: true });
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Backup restore failed');
	process.exitCode = 1;
});
