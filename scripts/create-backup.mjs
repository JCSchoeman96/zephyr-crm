import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const envelopeHeader = Buffer.from('ZEPHYR-CRM-BACKUP-1\0');
const trustedSecretNames = [
	'SUPABASE_SERVICE_ROLE_KEY',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_WEBHOOK_SECRET',
	'BRICKS_WEBHOOK_SECRET',
	'AUTOMATION_CRON_SECRET',
	'BACKUP_ENCRYPTION_KEY'
];

function run(command, args) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	} catch {
		throw new Error(`${command} failed while creating the backup`);
	}
}

function statusEnv() {
	const output = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		output
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

function parseKey(value) {
	const trimmed = value.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex');
	const base64 = Buffer.from(trimmed, 'base64');
	if (base64.length === 32) return base64;
	throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hex or base64 secret');
}

function timestamp() {
	return new Date()
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replaceAll(/[-:]/g, '');
}

function jsonHeaders(serviceRoleKey) {
	return {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		'content-type': 'application/json'
	};
}

async function apiJson(url, serviceRoleKey, init = {}) {
	const response = await fetch(url, {
		...init,
		headers: {
			...jsonHeaders(serviceRoleKey),
			...(init.headers ?? {})
		}
	});
	const body = await response.text();
	if (!response.ok) throw new Error(`Supabase API request failed (${response.status})`);
	try {
		return body ? JSON.parse(body) : null;
	} catch {
		throw new Error('Supabase API returned invalid JSON');
	}
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

async function walkFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walkFiles(path)));
		else files.push(path);
	}
	return files;
}

function ensureInside(parent, child) {
	const parentPath = resolve(parent) + sep;
	const childPath = resolve(child);
	if (!childPath.startsWith(parentPath))
		throw new Error('Backup path escaped its staging directory');
	return childPath;
}

async function writeJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function listStorageObjects(apiUrl, serviceRoleKey) {
	const objects = [];
	for (let offset = 0; ; offset += 1000) {
		const page = await apiJson(`${apiUrl}/storage/v1/object/list/quote-documents`, serviceRoleKey, {
			method: 'POST',
			body: JSON.stringify({
				prefix: '',
				limit: 1000,
				offset,
				sortBy: { column: 'name', order: 'asc' }
			})
		});
		if (!Array.isArray(page)) throw new Error('Storage object listing returned an invalid shape');
		objects.push(...page);
		if (page.length < 1000) return objects.filter((object) => object?.name && object.id);
	}
}

async function dumpDatabase(staging, databaseUrl) {
	const schemaPath = join(staging, 'database', 'schema.sql');
	const dataPath = join(staging, 'database', 'data.sql');
	await mkdir(dirname(schemaPath), { recursive: true });
	const connection = databaseUrl ? ['--db-url', databaseUrl] : ['--local'];
	run('bunx', [
		'supabase',
		'db',
		'dump',
		...connection,
		'--schema',
		'public,private',
		'--file',
		schemaPath
	]);
	run('bunx', [
		'supabase',
		'db',
		'dump',
		...connection,
		'--data-only',
		'--schema',
		'public,private',
		'--file',
		dataPath
	]);
}

function databaseJson(databaseUrl, query) {
	const value = run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
	return value ? JSON.parse(value) : [];
}

async function main() {
	const encryptionKey = parseKey(process.env.BACKUP_ENCRYPTION_KEY ?? '');
	const outputDirectory = process.env.BACKUP_OUTPUT_DIR?.trim();
	if (!outputDirectory)
		throw new Error('BACKUP_OUTPUT_DIR is required and must be outside the repository');
	const outputPath = resolve(outputDirectory);
	const rootPath = resolve(root) + sep;
	if (outputPath.startsWith(rootPath) && process.env.BACKUP_LOCAL_TEST !== '1') {
		throw new Error('BACKUP_OUTPUT_DIR must be outside the repository unless BACKUP_LOCAL_TEST=1');
	}
	await mkdir(outputPath, { recursive: true });

	const local = process.env.BACKUP_DATABASE_URL ? null : statusEnv();
	const apiUrl = (process.env.PUBLIC_SUPABASE_URL ?? local?.API_URL)?.trim();
	const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? local?.SERVICE_ROLE_KEY)?.trim();
	const databaseUrl = process.env.BACKUP_DATABASE_URL?.trim() || null;
	const databaseConnection = databaseUrl ?? local?.DB_URL;
	if (!apiUrl || !serviceRoleKey || !databaseConnection)
		throw new Error('Supabase API, database and service-role configuration are required');

	const backupId = timestamp();
	const staging = await mkdir(join(tmpdir(), `zephyr-crm-backup-${backupId}-`), {
		recursive: true
	}).then(() => join(tmpdir(), `zephyr-crm-backup-${backupId}-`));
	const archivePath = join(tmpdir(), `zephyr-crm-backup-${backupId}.tar.gz`);
	try {
		await dumpDatabase(staging, databaseUrl);

		const profiles = databaseJson(
			databaseConnection,
			"select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json) from (select id, full_name, email, role, status, timezone, created_at, updated_at from public.profiles) p;"
		);
		const quotes = databaseJson(
			databaseConnection,
			"select coalesce(json_agg(to_jsonb(q) order by q.id), '[]'::json) from (select id, document_path, document_hash, document_generated_at from public.quotes where document_path is not null) q;"
		);
		const authUsersBody = await apiJson(
			`${apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
			serviceRoleKey
		);
		const authUsers = (
			Array.isArray(authUsersBody) ? authUsersBody : (authUsersBody?.users ?? [])
		).map((user) => ({
			id: user.id,
			email: user.email ?? null,
			created_at: user.created_at ?? null,
			confirmed_at: user.confirmed_at ?? null,
			user_metadata: user.user_metadata ?? {}
		}));
		await writeJson(join(staging, 'auth', 'profiles.json'), profiles);
		await writeJson(join(staging, 'auth', 'users-reconstruction.json'), authUsers);
		await writeJson(join(staging, 'database', 'quote-document-mappings.json'), quotes);

		const storageObjects = await listStorageObjects(apiUrl, serviceRoleKey);
		const storageRoot = join(staging, 'storage', 'quote-documents');
		const storageManifest = [];
		for (const object of storageObjects) {
			const objectPath = String(object.name);
			const destination = ensureInside(storageRoot, join(storageRoot, objectPath));
			await mkdir(dirname(destination), { recursive: true });
			const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
			const response = await fetch(`${apiUrl}/storage/v1/object/quote-documents/${encodedPath}`, {
				headers: jsonHeaders(serviceRoleKey)
			});
			if (!response.ok) throw new Error(`Storage object download failed (${response.status})`);
			await writeFile(destination, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
			storageManifest.push({
				name: objectPath,
				id: object.id,
				metadata: object.metadata ?? null,
				updated_at: object.updated_at ?? null,
				backup_path: relative(staging, destination).split(sep).join('/')
			});
		}
		await writeJson(join(staging, 'storage', 'objects.json'), storageManifest);

		await mkdir(join(staging, 'project'), { recursive: true });
		await copyFile(
			join(root, 'supabase', 'config.toml'),
			join(staging, 'project', 'supabase-config.toml')
		);
		await copyFile(join(root, 'wrangler.jsonc'), join(staging, 'project', 'wrangler.jsonc'));
		await copyFile(join(root, '.env.example'), join(staging, 'project', '.env.example'));
		await copyFile(join(root, '.dev.vars.example'), join(staging, 'project', '.dev.vars.example'));
		await copyFile(join(root, 'bun.lock'), join(staging, 'project', 'bun.lock'));
		await mkdir(join(staging, 'project', 'migrations'), { recursive: true });
		const migrationFiles = (await readdir(join(root, 'supabase', 'migrations'))).filter((file) =>
			file.endsWith('.sql')
		);
		for (const migration of migrationFiles) {
			await copyFile(
				join(root, 'supabase', 'migrations', migration),
				join(staging, 'project', 'migrations', migration)
			);
		}

		const payloadFiles = (await walkFiles(staging)).filter(
			(path) => relative(staging, path) !== 'manifest.json'
		);
		const fileEntries = [];
		for (const path of payloadFiles) {
			const relativePath = relative(staging, path).split(sep).join('/');
			fileEntries.push({
				path: relativePath,
				bytes: (await stat(path)).size,
				sha256: await sha256File(path)
			});
		}
		fileEntries.sort((a, b) => a.path.localeCompare(b.path));
		await writeJson(join(staging, 'manifest.json'), {
			format: 'zephyr-crm-backup',
			version: 1,
			backup_id: backupId,
			created_at: new Date().toISOString(),
			source: databaseUrl ? 'external-database' : 'local-supabase',
			retention_days: Number(process.env.BACKUP_RETENTION_DAYS ?? 30),
			files: fileEntries,
			storage_objects: storageManifest,
			auth_recovery: {
				password_hashes_exported: false,
				password_reset_or_reinvite_required: true,
				mfa_reenrollment_required: true
			},
			secret_names: trustedSecretNames,
			restore_requirements: [
				'Create a disposable PostgreSQL target with the matching major version.',
				'Restore private Storage bytes and quote document mappings together.',
				'Restore Auth identities through the provider admin/invite flow; never restore passwords from this bundle.',
				'Restore trusted secrets from the approved secret manager and rotate them after an incident.'
			]
		});

		run('tar', ['-czf', archivePath, '-C', staging, '.']);
		const plaintext = await readFile(archivePath);
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const envelope = Buffer.concat([envelopeHeader, iv, cipher.getAuthTag(), encrypted]);
		const finalPath = join(outputPath, `zephyr-crm-${backupId}.tar.gz.enc`);
		await writeFile(finalPath, envelope, { mode: 0o600 });

		const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
		const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
		for (const file of await readdir(outputPath)) {
			if (!/^zephyr-crm-\d{8}T\d{6}Z\.tar\.gz\.enc$/.test(file)) continue;
			const path = join(outputPath, file);
			if ((await stat(path)).mtimeMs < cutoff && path !== finalPath)
				await rm(path, { force: true });
		}
		console.log(
			JSON.stringify({ backup: finalPath, backup_id: backupId, files: fileEntries.length })
		);
	} finally {
		await rm(staging, { recursive: true, force: true });
		await rm(archivePath, { force: true });
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Backup creation failed');
	process.exitCode = 1;
});
