# Zephyr CRM recovery contract

A PostgreSQL dump alone is not recovery proof. A complete recovery bundle and
disposable restore must cover:

1. PostgreSQL business data, relationships, private schema, migrations and
   schema version;
2. private Storage object bytes, metadata/path mappings, quote PDFs and hashes;
3. non-secret application configuration, `wrangler.jsonc`, Supabase config and
   the exact dependency lockfile;
4. Auth identity reconstruction inputs: stable user IDs or deterministic
   remapping, emails, profile links, role/status/suspension state, and the
   provider-supported reconstruction mode;
5. password reset or re-invite requirements when password hashes are not
   portable;
6. mandatory MFA re-enrolment when MFA factors are not portable; and
7. secret restoration procedures through the approved secret manager, without
   placing secrets in the bundle or repository.

`bun run backup:create` writes an encrypted AES-256-GCM bundle and manifest.
`bun run backup:restore` verifies manifest hashes and restores into a proven
disposable PostgreSQL target. The P12/P14 recovery gates also restore
representative private documents, verify their hashes and exercise the
identity/profile/role/status reconstruction expectations. A hosted recovery
must repeat this drill under the client's ownership before pilot approval.
