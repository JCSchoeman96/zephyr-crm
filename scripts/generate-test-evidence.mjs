import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const coverage = readFileSync(resolve(root, 'docs/REQUIREMENTS_COVERAGE.md'), 'utf8');
const authorityVersion = JSON.parse(
	readFileSync(resolve(root, 'docs/AUTHORITY_HASHES.json'), 'utf8')
).version;

const phaseScripts = {
	P0: null,
	P1: 'package.json',
	P2: 'tests/e2e/design-system.e2e.ts',
	P3: 'scripts/test-database-security.mjs',
	P4: 'scripts/test-p4-tracer.mjs',
	P5: 'scripts/test-p5-leads.mjs',
	P6: 'scripts/test-p6-clients.mjs',
	P7: 'scripts/test-p7-quotes.mjs',
	P8: 'scripts/test-p8-documents.mjs',
	P9: 'scripts/test-p9-automation.mjs',
	P10: 'scripts/test-p10-analytics.mjs',
	P11: 'scripts/test-p11-hardening.mjs',
	P12: 'scripts/test-p12-hardening.mjs',
	P13: 'scripts/test-p13-template.mjs',
	P14: 'scripts/test-p14-release.mjs'
};

const phaseCommands = {
	P0: 'bun run authority:verify',
	P1: 'bun run check',
	P2: 'bun run test:e2e:smoke',
	P3: 'bun run db:security',
	P4: 'bun run test:p4:domain',
	P5: 'bun run test:p5:leads',
	P6: 'bun run test:p6:clients',
	P7: 'bun run test:p7:quotes',
	P8: 'bun run test:p8:documents',
	P9: 'bun run test:p9:automation',
	P10: 'bun run test:p10:analytics',
	P11: 'bun run test:p11:hardening',
	P12: 'bun run test:p12:hardening',
	P13: 'bun run test:p13:template',
	P14: 'bun run test:p14:release'
};

const staticTypes =
	/manual|document|static|review|shell|config|loop state|toolchain|build artifact|boundary/i;
const externalGates = new Map([
	[
		'P8-T10',
		'Live sender-domain DNS verification remains a hosted pilot gate; local proof covers the documented procedure and fail-closed configuration.'
	]
]);

const p0Proofs = {
	'P0-T01': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/ARCHITECTURE.md',
				contains: ['Each domain and its canonical resources are defined']
			},
			{
				source: 'docs/DOMAIN_MODEL.md',
				contains: ['This document is the single definition of Zephyr CRM resources']
			},
			{ source: 'docs/STATE_MACHINES.md', contains: ['## Lead attention'] },
			{
				source: 'docs/SECURITY_MODEL.md',
				contains: ['## Protected-field/action mutation matrix']
			},
			{
				source: 'docs/ROADMAP.md',
				contains: ['No phase may introduce a competing definition']
			}
		]
	},
	'P0-T02': {
		command: phaseCommands.P0,
		sources: [
			{ source: 'docs/ARCHITECTURE.md', contains: ['## Product boundary'] },
			{ source: 'docs/DOMAIN_MODEL.md', contains: ['## Resource map'] },
			{ source: 'docs/STATE_MACHINES.md', contains: ['Canonical values are lowercase'] },
			{ source: 'docs/SECURITY_MODEL.md', contains: ['## Authorization matrix'] },
			{
				source: 'docs/ROADMAP.md',
				contains: ['No phase may introduce a competing definition for Lead']
			}
		]
	},
	'P0-T03': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/ARCHITECTURE.md',
				contains: [
					'## Deferred scope',
					'future product decisions, not hidden current requirements.'
				]
			},
			{
				source: 'docs/ROADMAP.md',
				contains: ['## Deferred v1 scope', 'outside P0–P14']
			}
		]
	},
	'P0-T05': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/ROADMAP.md',
				contains: ['Dependencies are strict and sequential.', '| P0 |', '| P1 |']
			}
		]
	},
	'P0-T06': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/STATE_MACHINES.md',
				contains: ['waiting_on_client', 'pause_reason', 'type = follow_up', 'overdue']
			}
		]
	},
	'P0-T07': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/MONEY_CONTRACT.md',
				contains: ['PostgreSQL `numeric` values and decimal', 'ROUND_HALF_UP', 'server-owned']
			}
		]
	},
	'P0-T08': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/SECURITY_MODEL.md',
				contains: [
					'## Protected-field/action mutation matrix',
					'Activity remains append-only evidence',
					'ordinary UPDATE/DELETE'
				]
			}
		]
	},
	'P0-T09': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/DOMAIN_MODEL.md',
				contains: [
					'complete seller/recipient/commercial snapshots',
					'Commercial settings are copied into the Quote snapshot'
				]
			},
			{
				source: 'docs/STATE_MACHINES.md',
				contains: ['old Quote remains unchanged and historically readable']
			},
			{
				source: 'docs/SECURITY_MODEL.md',
				contains: ['acceptance fields', 'document path/hash/provenance']
			}
		]
	},
	'P0-T10': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/STATE_MACHINES.md',
				contains: [
					'## Outbound Message lifecycle',
					'submission_unknown',
					'Each logical message keeps append-only attempt evidence',
					'No automatic resend is allowed'
				]
			}
		]
	},
	'P0-T11': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/PRIVACY_OPERATIONS.md',
				contains: ['data-subject access', 'POPIA/legal notification procedure']
			},
			{
				source: 'docs/RECOVERY_CONTRACT.md',
				contains: [
					'A PostgreSQL dump alone is not recovery proof.',
					'Auth identity reconstruction inputs',
					'secret restoration procedures'
				]
			}
		]
	},
	'P0-T12': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/METRICS_CONTRACT.md',
				contains: [
					'inclusive UTC calendar dates',
					'configured IANA timezone',
					'Won / (Won + Lost) * 100'
				]
			},
			{
				source: 'docs/DOMAIN_MODEL.md',
				contains: [
					'### ClientContact',
					'`ClientContact` belongs to one Client',
					'### Phone normalization',
					'`phone` preserves the original display text',
					'`phone_normalized` is a separate comparison/index value',
					'Normalization occurs at the trusted server/database boundary',
					'Only values that explicitly begin with `+`',
					'Ambiguous national-format input without an explicit `+` country code produces `null`',
					'never guesses an implicit country code'
				]
			},
			{
				source: 'DEPENDENCY_BASELINE_v1.0.0.md',
				contains: [
					'## 2. Runtime and Build Responsibility',
					'Bun',
					'package-script runner',
					'every direct dependency is exact-pinned',
					'`bun.lock` is committed'
				]
			}
		]
	},
	'P0-T13': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'DEPENDENCY_BASELINE_v1.0.0.md',
				contains: ['## 2. Runtime and Build Responsibility', 'Bun', 'SvelteKit', 'SendPulse']
			}
		]
	},
	'P0-T14': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'DEPENDENCY_BASELINE_v1.0.0.md',
				contains: [
					'## 6. Exact-Pin Law',
					'## 7. ShadCN Source-Ownership Law',
					'## 11. State, Forms, Dates and Realtime',
					'An autonomous agent must not introduce a new production dependency'
				]
			}
		]
	},
	'P0-T15': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/SECURITY_MODEL.md',
				contains: [
					'SECURITY INVOKER',
					'SECURITY DEFINER',
					'search_path',
					'restricted `EXECUTE` grants'
				]
			}
		]
	},
	'P0-T16': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'docs/SECURITY_MODEL.md',
				contains: ['invitation-only', 'raw_user_meta_data', 'current session must satisfy AAL2']
			}
		]
	},
	'P0-T17': {
		command: phaseCommands.P0,
		sources: [
			{
				source: 'AGENTS.md',
				contains: ['authority_sha256', 'EXECUTION STOP — Unexpected Authority Drift']
			},
			{
				source: 'scripts/verify-authority-hashes.mjs',
				contains: ['Authority drift detected in', 'recordedPaths']
			},
			{ source: 'docs/AUTHORITY_HASHES.json', contains: ['"docs/STATE_MACHINES.md"'] }
		]
	}
};

const p0HistoricalProof = {
	command: 'git diff --name-status 021d6fc^ 021d6fc',
	kind: 'git-boundary',
	boundary_commit: '021d6fc7c29071da9f235a7d1275f688452c25de',
	implementation_start_commit: '21f2e18ea2c6e3a3f44c8b3100c764b2a4e09f62',
	boundary_files: [
		'docs/ARCHITECTURE.md',
		'docs/DOMAIN_MODEL.md',
		'docs/ROADMAP.md',
		'docs/SECURITY_MODEL.md',
		'docs/STATE_MACHINES.md'
	],
	limitation:
		'Historical Git provenance is reviewed manually; this evidence does not claim that authority verification proves no implementation leakage.'
};

const p1Proofs = {
	'P1-T01': {
		classification: 'STATIC',
		proof: {
			command: 'bun install --frozen-lockfile',
			sources: [
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: ['bun install --frozen-lockfile', 'only JavaScript lockfile']
				},
				{ source: 'package.json', contains: ['"packageManager": "bun@1.2.22"'] },
				{ source: 'bun.lock', contains: ['"lockfileVersion": 1'] }
			]
		}
	},
	'P1-T02': {
		classification: 'AUTOMATED',
		proof: {
			command: 'bun run check',
			source: 'package.json',
			assertion:
				'"check": "bun run gen && wrangler types --include-env=false --check && svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",'
		}
	},
	'P1-T03': {
		classification: 'AUTOMATED',
		proof: {
			command: 'bun run test:unit -- --run',
			source: 'package.json',
			assertion: '"test:unit": "vitest",'
		}
	},
	'P1-T04': {
		classification: 'AUTOMATED',
		proof: {
			command: 'bun run build',
			source: 'package.json',
			assertion:
				'"build": "bun run gen && wrangler types --include-env=false --check && vite build",'
		}
	},
	'P1-T05': {
		classification: 'AUTOMATED',
		proof: {
			command: 'bun run test:p1:lifecycle',
			source: 'scripts/test-p1-lifecycle.mjs',
			assertion:
				"assert(status.includes('API_URL='), 'Local Supabase status did not expose API_URL after reset.');"
		}
	},
	'P1-T06': {
		classification: 'STATIC',
		proof: {
			command: 'bun run security:bundle',
			sources: [
				{
					source: 'scripts/check-public-bundle.mjs',
					contains: [
						'const forbiddenNames = [...trustedEnvironmentKeys, ...privateConfigurationKeys];',
						'const forbiddenValues = forbiddenValueKeys'
					]
				},
				{
					source: 'src/lib/config/env.ts',
					contains: [
						'SENDPULSE_WEBHOOK_SECRET',
						'SENDPULSE_SENDER_DOMAIN',
						'SENDPULSE_DKIM_RECORD',
						'AUTOMATION_CRON_SECRET'
					]
				},
				{
					source: 'src/lib/config/client-config.ts',
					contains: ['assertPublicProjectionInput', 'PUBLIC_CLIENT_CONFIG_JSON']
				},
				{
					source: 'docs/SECURITY_MODEL.md',
					contains: ['The parser rejects fields outside this explicit']
				}
			]
		}
	},
	'P1-T07': {
		classification: 'STATIC',
		proof: {
			command: 'bun run diff:check',
			sources: [
				{ source: '.gitignore', contains: ['.env.*', '!.env.example', '.dev.vars'] },
				{ source: 'package.json', contains: ['"diff:check": "git diff --check"'] }
			]
		}
	},
	'P1-T08': {
		classification: 'STATIC',
		proof: {
			command: 'bun run ci:contract',
			sources: [
				{
					source: 'scripts/check-ci-contract.mjs',
					contains: ['const requiredCommands = [', 'if (!workflow.includes', 'if: always()']
				},
				{
					source: '.github/workflows/ci.yml',
					contains: ['run: bun install --frozen-lockfile', 'run: bun run db:stop']
				}
			]
		}
	},
	'P1-T09': {
		classification: 'STATIC',
		proof: {
			command: 'bun install --frozen-lockfile',
			sources: [
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: ['Bun package manager/runner', '@lucide/svelte 1.33.0', 'Supabase JS / CLI']
				},
				{ source: 'package.json', contains: ['"packageManager": "bun@1.2.22"'] },
				{ source: 'bun.lock', contains: ['"@lucide/svelte": "1.33.0"'] }
			]
		}
	},
	'P1-T10': {
		classification: 'STATIC',
		proof: {
			command: 'bun run build',
			sources: [
				{
					source: 'package.json',
					contains: ['wrangler types --include-env=false --check', 'vite build']
				},
				{
					source: 'wrangler.jsonc',
					contains: [
						'"main": ".svelte-kit/cloudflare/_worker.js"',
						'"directory": ".svelte-kit/cloudflare"',
						'"binding": "ASSETS"'
					]
				},
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: ['artifact through Vite', '.svelte-kit/cloudflare/_worker.js']
				}
			]
		}
	},
	'P1-T11': {
		classification: 'STATIC',
		proof: {
			command: 'bun run authority:registry',
			sources: [
				{ source: 'package.json', contains: ['"packageManager": "bun@1.2.22"'] },
				{
					source: 'scripts/verify-authority-registry.mjs',
					contains: [
						"packageManager !== 'bun@1.2.22'",
						'lockfile authority is not exactly bun.lock'
					]
				}
			]
		}
	},
	'P1-T12': {
		classification: 'STATIC',
		proof: {
			command: 'bun run authority:registry',
			sources: [
				{ source: 'package.json', contains: ['"dependencies": {', '"devDependencies": {'] },
				{
					source: 'scripts/verify-authority-registry.mjs',
					contains: ['exact-pinned']
				},
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: ['Every direct dependency is exact-pinned']
				}
			]
		}
	},
	'P1-T13': {
		classification: 'STATIC',
		proof: {
			command: 'bun run authority:registry',
			sources: [
				{
					source: 'scripts/verify-authority-registry.mjs',
					contains: [
						"['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']",
						'lockfile authority is not exactly bun.lock'
					]
				},
				{ source: 'bun.lock', contains: ['"lockfileVersion": 1'] }
			]
		}
	},
	'P1-T14': {
		classification: 'STATIC',
		proof: {
			command: 'bun run test:p1:compatibility',
			sources: [
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: [
						'One-time machine prerequisite',
						'bun run test:p1:compatibility',
						'owns the sequential Phase 1 proof',
						'fails if `bun.lock` changes during the run'
					]
				},
				{ source: 'package.json', contains: ['"test:p1:compatibility":'] },
				{
					source: 'scripts/test-p1-compatibility.mjs',
					contains: [
						'const compatibilitySteps = [',
						"['db:start']",
						"['db:reset']",
						"['test:e2e:smoke']",
						"['db:test']",
						"['db:security']",
						'finally',
						'lockfileHash()'
					]
				}
			]
		}
	},
	'P1-T15': {
		classification: 'STATIC',
		proof: {
			command: 'bun run build',
			sources: [
				{
					source: 'scripts/test-p1-toolchain.mjs',
					contains: [
						"assert(!existsSync('wrangler.toml'), 'A competing wrangler.toml configuration must not exist.');"
					]
				},
				{
					source: 'wrangler.jsonc',
					contains: ['"main": ".svelte-kit/cloudflare/_worker.js"', '"binding": "ASSETS"']
				},
				{
					source: 'scripts/verify-authority-registry.mjs',
					contains: ['wrangler.jsonc', 'Cloudflare Pages']
				}
			]
		}
	},
	'P1-T16': {
		classification: 'STATIC',
		proof: {
			command: 'bun run authority:registry',
			sources: [
				{ source: 'wrangler.jsonc', contains: ['"compatibility_date": "2026-08-21"'] },
				{ source: 'scripts/verify-authority-registry.mjs', contains: ['"compatibility_date"'] }
			]
		}
	},
	'P1-T17': {
		classification: 'STATIC',
		proof: {
			command: 'bun run build',
			sources: [
				{ source: 'package.json', contains: ['"build": "bun run gen', 'vite build'] },
				{
					source: 'DEPENDENCY_BASELINE_v1.0.0.md',
					contains: ['Bun must not replace Vite as the SvelteKit application bundler']
				},
				{ source: 'docs/TOOLCHAIN_PROOF.md', contains: ['Vite owns the SvelteKit build'] }
			]
		}
	},
	'P1-T18': {
		classification: 'STATIC',
		proof: {
			command: 'bun run authority:registry',
			sources: [
				{
					source: 'package.json',
					contains: ['"supabase": "2.115.0"', '"db:reset": "bunx supabase db reset"']
				},
				{
					source: 'DEPENDENCY_BASELINE_v1.0.0.md',
					contains: [
						'Project-local exact dev dependency',
						'project-local `supabase` CLI dev dependency'
					]
				}
			]
		}
	},
	'P1-T19': {
		classification: 'STATIC',
		proof: {
			command: 'bun run test:p1:toolchain',
			sources: [
				{
					source: 'scripts/test-p1-toolchain.mjs',
					contains: [
						"for (const required of ['vitest', '@playwright/test', 'svelte-check', 'eslint', 'prettier'])",
						"for (const prohibited of ['jest', 'cypress', 'react-icons', '@fortawesome'])"
					]
				},
				{
					source: 'package.json',
					contains: [
						'"vitest": "4.1.11"',
						'"@playwright/test": "1.62.1"',
						'"svelte-check": "4.7.6"',
						'"eslint": "10.9.0"',
						'"prettier": "3.9.6"'
					]
				}
			]
		}
	},
	'P1-T20': {
		classification: 'STATIC',
		proof: {
			command: 'bun install --frozen-lockfile && bun run test:p1:compatibility',
			sources: [
				{
					source: 'docs/TOOLCHAIN_PROOF.md',
					contains: [
						'Frozen reinstall gate:',
						'bun install --frozen-lockfile && bun run test:p1:compatibility',
						'without lockfile mutation'
					]
				},
				{ source: 'package.json', contains: ['"test:p1:compatibility":'] },
				{
					source: 'scripts/test-p1-compatibility.mjs',
					contains: [
						"const lockfile = resolve(root, 'bun.lock');",
						'lockfileHash()',
						'bun.lock unexpectedly'
					]
				},
				{ source: 'bun.lock', contains: ['"lockfileVersion": 1'] }
			]
		}
	}
};

const proofOverrides = {
	'P3-T18': {
		command: 'bun run auth:readiness',
		source: 'scripts/test-auth-readiness.mjs',
		assertion:
			"assert(aal1.data?.currentLevel === 'aal1', 'fresh Owner session did not start at AAL1');"
	},
	'P5-T05': {
		command: 'bun run test:p5:leads',
		source: 'scripts/test-p5-leads.mjs',
		assertion:
			"\tassert(\n\t\tinbound.length === 1 &&\n\t\t\tinbound[0].intake_state === 'accepted' &&\n\t\t\tinbound[0].lead_id === accepted.body.lead_id,\n\t\t'Accepted inbound record was not durable'\n\t);"
	},
	'P5-T06': {
		command: 'bun run test:p5:leads',
		source: 'scripts/test-p5-leads.mjs',
		assertion:
			"\tassert(\n\t\tinbound.length === 1 &&\n\t\t\tinbound[0].intake_state === 'accepted' &&\n\t\t\tinbound[0].lead_id === accepted.body.lead_id,\n\t\t'Accepted inbound record was not durable'\n\t);"
	},
	'P5-T15': {
		command: 'bun run test:p5:leads',
		source: 'scripts/test-p5-leads.mjs',
		assertion: 'assert(!result.response.ok, `${label} unexpectedly succeeded`);'
	},
	'P7-T15': {
		command: 'bun run test:p7:quotes',
		source: 'scripts/test-p7-quotes.mjs',
		assertion:
			'assert(\n\t\tresult.response.ok,\n\t\t`RPC ${name} failed (${result.response.status}): ${JSON.stringify(result.body)}`\n\t);'
	},
	'P8-T13': {
		command: 'bun run test:p8:documents',
		source: 'scripts/test-p8-documents.mjs',
		assertion:
			"assert(\n\t\tretryMessages.length === 1 && retryMessages[0].attempt_count === 2,\n\t\t'Retry created a duplicate outbound message or did not increment the attempt'\n\t);"
	},
	'P8-T16': {
		command: 'bun run test:p8:documents',
		source: 'scripts/test-p8-documents.mjs',
		assertion:
			"assert(\n\t\trejectedWebhook.response.status === 415 && wrongSignature.response.status === 401,\n\t\t'SendPulse webhook did not enforce content type and signature boundaries'\n\t);"
	},
	'P12-T01': {
		command: 'bun run test:p12:hardening',
		source: 'scripts/test-p12-hardening.mjs',
		assertion:
			"\tassert(\n\t\tsql(local.DB_URL, \"select to_regclass('public.operational_events') is not null;\") === 't',\n\t\t'P12 migration did not reset cleanly'\n\t);"
	},
	'P12-T02': {
		command: 'bun run test:p12:hardening',
		source: 'scripts/test-p12-hardening.mjs',
		assertion:
			"\tassert(\n\t\tsql(local.DB_URL, \"select to_regclass('public.operational_events') is not null;\") === 't',\n\t\t'P12 migration did not reset cleanly'\n\t);"
	},
	'P12-T18': {
		command: 'bun run auth:readiness',
		source: 'scripts/test-auth-readiness.mjs',
		assertion:
			"assert(aal2.data?.currentLevel === 'aal2', 'verified TOTP session did not reach AAL2');"
	},
	'P14-T02': {
		command: 'bun run test:p4:tracer',
		source: 'scripts/test-p4-tracer.mjs',
		assertion:
			"if (!clientId) throw new Error('Won conversion did not expose the created Client link');"
	},
	'P14-T03': {
		command: 'bun run test:p4:tracer',
		source: 'scripts/test-p4-tracer.mjs',
		assertion:
			"if (!lostDetail.includes('LOST')) throw new Error('Lost transition with reason did not persist');"
	},
	'P14-T04': {
		command: 'bun run test:p7:quotes',
		source: 'scripts/test-p7-quotes.mjs',
		assertion: "'Historical Quote snapshot changed with current settings'"
	},
	'P14-T05': {
		command: 'bun run test:p8:documents',
		source: 'scripts/test-p8-documents.mjs',
		assertion: "'Retry duplicated CRM state'"
	},
	'P14-T06': {
		command: 'bun run db:security',
		source: 'scripts/test-database-security.mjs',
		assertion: "'Suspended user retained CRM access'"
	},
	'P14-T07': {
		command: 'bun run test:p5:leads',
		source: 'scripts/test-p5-leads.mjs',
		assertion: "'Malformed JSON was not rejected'"
	},
	'P14-T08': {
		command: 'bun run test:v131:communications',
		source: 'scripts/test-v131-communications.mjs',
		assertion: "'submission_unknown'"
	},
	'P14-T09': {
		command: 'bun run test:p12:hardening',
		source: 'scripts/test-p12-hardening.mjs',
		assertion: "'password_reset_or_reinvite_required'"
	},
	'P14-T10': {
		command: 'bun run test:p13:template',
		source: 'scripts/test-p13-template.mjs',
		assertion: "'Upgrade lost existing local data.'"
	},
	'P14-T11': {
		command: 'bun run test:p12:hardening',
		source: 'src/routes/api/diagnostics/+server.ts',
		assertion: "'operational_diagnostics'"
	},
	'P14-T12': {
		command: 'bun run build',
		source: 'package.json',
		assertion: '"build":'
	},
	'P14-T13': {
		command: 'bun run quality',
		source: 'scripts/test-p14-release.mjs',
		assertion: 'const evidence = validateEvidenceRegistry(registry, { root });'
	},
	'P14-T14': {
		command: 'bun run test:p14:release',
		source: 'scripts/test-p14-release.mjs',
		assertion: 'evidence.count === registry.entries.length,'
	},
	'P14-T15': {
		command: 'bun run test:p14:release',
		source: 'scripts/test-p14-release.mjs',
		assertion: "read('docs/PILOT_READINESS.md').includes('NOT_STARTED')"
	},
	'P14-T16': {
		command: 'bun run release:state:p14',
		source: 'scripts/check-release-state.mjs',
		assertion: "state.local_build_status === 'FINAL_VALIDATION_PENDING'"
	},
	'P14-T17': {
		command: 'bun run test:p7:quotes',
		source: 'scripts/test-p7-quotes.mjs',
		assertion: "'Sent Quote owner mutation'"
	},
	'P14-T18': {
		command: 'bun run test:p10:analytics',
		source: 'scripts/test-p10-analytics.mjs',
		assertion: "'P10-T02 zero-denominator conversion formula'"
	},
	'P14-T19': {
		command: 'bun run test:p12:hardening',
		source: 'docs/PILOT_READINESS.md',
		assertion: 'MFA'
	},
	'P14-T20': {
		command: 'bun run authority:verify',
		source: 'scripts/verify-authority-hashes.mjs',
		assertion: 'Authority drift detected in'
	},
	'P14-T21': {
		command: 'bun run authority:registry',
		source: 'scripts/verify-authority-registry.mjs',
		assertion: 'exact-pinned'
	},
	'P14-T22': {
		command: 'bun run release:state:parity',
		source: 'scripts/test-pilot-readiness-parity.mjs',
		assertion: 'assert.deepEqual(parseReadinessProjection(readiness(nonTerminal)), {'
	},
	'P14-T23': {
		command: 'bun run test:p14:gate-semantics',
		source: 'scripts/test-p14-gate-semantics.mjs',
		assertion:
			"assert(!releaseScript.includes(\"['run', 'quality']\"), 'P14 release proof must not invoke quality.');"
	},
	'P14-T24': {
		command: 'bun run test:p14:browser-harness',
		source: 'tests/e2e/domain/stateful-harness.e2e.ts',
		assertion:
			"await expect(page.getByRole('heading', { name: 'P14 Browser Harness' })).toBeVisible();"
	},
	'P14-T25': {
		command: 'bun run test:p14:won-flow',
		source: 'tests/e2e/domain/won-flow.e2e.ts',
		assertion: "expect(client?.status).toBe('active');"
	},
	'P14-T26': {
		command: 'bun run test:p14:lost-flow',
		source: 'tests/e2e/domain/lost-flow.e2e.ts',
		assertion: "await expect(page.getByText('LOST', { exact: true })).toBeVisible();"
	},
	'P14-T27': {
		command: 'bun scripts/test-p14-client-integrity.mjs',
		source: 'scripts/test-p14-client-integrity.mjs',
		assertion:
			"assert(!directPatch.response.ok, 'Raw Client status PATCH bypassed trusted action');"
	},
	'P14-T28': {
		command: 'bun scripts/test-p14-contact-integrity.mjs',
		source: 'scripts/test-p14-contact-integrity.mjs',
		assertion: "assert(!rawDelete.response.ok, 'Raw ClientContact delete bypassed retention law');"
	},
	'P14-T29': {
		command: 'bun scripts/test-p14-task-integrity.mjs',
		source: 'scripts/test-p14-task-integrity.mjs',
		assertion: "assert(!rawInsert.response.ok, 'Raw Task INSERT bypassed create_task');"
	},
	'P14-T30': {
		command: 'bun run test:p14:document-fitness',
		source: 'src/lib/domain/quotes/document.spec.ts',
		assertion: 'expect(parsed.getPageCount()).toBeGreaterThan(1);'
	},
	'P14-T31': {
		command: 'bun run test:p14:email-safety',
		source: 'src/lib/domain/communications/sendpulse-adapter.spec.ts',
		assertion: ').rejects.toThrow(/sender email and name/i);'
	},
	'P14-T32': {
		command: 'bun run test:p14:navigation',
		source: 'scripts/test-p14-navigation.mjs',
		assertion: 'assert.match(reports, /error\\(404/);'
	},
	'P14-T33': {
		command: 'bun run test:p14:product-flow',
		source: 'tests/e2e/domain/role-accessibility.e2e.ts',
		assertion: "await expect(page.getByText('Viewer access is read-only.').first()).toBeVisible();"
	},
	'P14-T34': {
		command: 'bun scripts/test-p14-hardening-reconciliation.mjs',
		source: 'docs/release/P14_HARDENING_DISPOSITION.md',
		assertion: '| ZH-018 | FIXED |'
	},
	'P14-T35': {
		command: 'bun scripts/test-p14-mutation-parity.mjs',
		source: 'scripts/test-p14-mutation-parity.mjs',
		assertion: "leadAndOutboundLaw.includes('private.allow_outbound_attempt_mutation'),"
	}
};

function parseRows() {
	return [...coverage.matchAll(/^\| `(P\d+-T\d+)` \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|$/gm)].map(
		(match) => ({
			id: match[1],
			title: match[2],
			type: match[3],
			criterion: match[4],
			evidence: match[5]
		})
	);
}

function phaseAuthority(phase) {
	const file = Object.keys(phaseScripts).find((candidate) => candidate === phase);
	const authority = {
		P0: 'PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md',
		P1: 'PHASE_01_PROJECT_SCAFFOLD_QUALITY_GATES.md',
		P2: 'PHASE_02_DESIGN_SYSTEM_APPLICATION_SHELL.md',
		P3: 'PHASE_03_DATABASE_IDENTITY_PERMISSIONS_RLS.md',
		P4: 'PHASE_04_COMPLETE_CRM_TRACER_BULLET.md',
		P5: 'PHASE_05_LEAD_MANAGEMENT_HARDENING.md',
		P6: 'PHASE_06_CLIENT_CONTACT_DOMAIN.md',
		P7: 'PHASE_07_QUOTE_DOMAIN_QUOTE_EDITOR.md',
		P8: 'PHASE_08_DOCUMENTS_COMMUNICATIONS.md',
		P9: 'PHASE_09_TASKS_FOLLOW_UPS_AUTOMATION.md',
		P10: 'PHASE_10_DASHBOARD_ANALYTICS.md',
		P11: 'PHASE_11_UX_REALTIME_PERFORMANCE_HARDENING.md',
		P12: 'PHASE_12_SECURITY_BACKUP_OPERATIONAL_HARDENING.md',
		P13: 'PHASE_13_REUSABLE_CLIENT_DEPLOYMENT_TEMPLATE.md',
		P14: 'PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md'
	}[phase];
	if (!file || !authority) throw new Error(`No authority mapping for ${phase}`);
	return `Phases/${authority}`;
}

function packageCommand(id) {
	const commands = {
		'P1-T01': 'bun install --frozen-lockfile',
		'P1-T02': 'bun run check',
		'P1-T03': 'bun run test:unit -- --run',
		'P1-T04': 'bun run build',
		'P1-T05': 'bun run db:reset',
		'P1-T06': 'bun run security:bundle',
		'P1-T07': 'bun run diff:check',
		'P1-T08': 'bun run authority:registry',
		'P1-T09': 'bun install --frozen-lockfile',
		'P1-T10': 'bun run build',
		'P1-T11': 'bun run authority:registry',
		'P1-T12': 'bun run authority:registry',
		'P1-T13': 'bun run authority:registry',
		'P1-T14': 'bun run quality',
		'P1-T15': 'bun run build',
		'P1-T16': 'bun run build',
		'P1-T17': 'bun run build',
		'P1-T18': 'bun run authority:registry',
		'P1-T19': 'bun run authority:registry',
		'P1-T20': 'bun run quality'
	};
	return commands[id];
}

function packageScriptAssertion(id) {
	const scriptName = id.split('-')[1];
	const scriptById = {
		'P1-T01': 'packageManager',
		'P1-T02': '"check":',
		'P1-T03': '"test:unit":',
		'P1-T04': '"build":',
		'P1-T05': '"db:reset":',
		'P1-T06': '"security:bundle":',
		'P1-T07': '"diff:check":',
		'P1-T08': '"authority:registry":',
		'P1-T09': 'packageManager',
		'P1-T10': '"build":',
		'P1-T11': '"packageManager": "bun@',
		'P1-T12': '"dependencies":',
		'P1-T13': 'bun.lock',
		'P1-T14': '"quality":',
		'P1-T15': '"build":',
		'P1-T16': '"build":',
		'P1-T17': '"build":',
		'P1-T18': '"db:reset":',
		'P1-T19': '"test:unit":',
		'P1-T20': '"quality":'
	};
	return scriptById[id] ?? scriptName;
}

function readSource(path) {
	return readFileSync(resolve(root, path), 'utf8');
}

function assertionAt(lines, start) {
	const line = lines[start].trim();
	if (/^assert\(\s*$/.test(line)) {
		const block = [lines[start]];
		for (let index = start + 1; index < Math.min(lines.length, start + 12); index += 1) {
			block.push(lines[index]);
			if (lines[index].includes(');')) break;
		}
		const joined = block.join('\n');
		if (!/message\)\s*;?$/.test(joined.trim())) return joined;
		return null;
	}
	if (/^assert\(/.test(line) && !/assert\(condition, message\)/.test(line)) return line;
	if (/^if\s*\(/.test(line) && line.includes('throw new Error')) {
		if (/!condition|!response\.ok\b/.test(line)) return null;
		return line;
	}
	if (/\btest\s*\(/.test(line)) return line;
	return null;
}

function nearestAssertion(source, id) {
	const lines = source.split('\n');
	const idLine = lines.findIndex((line) => line.includes(id));
	if (idLine < 0) return null;
	for (let index = idLine; index >= Math.max(0, idLine - 30); index -= 1) {
		const assertion = assertionAt(lines, index);
		if (assertion) return assertion;
	}
	return null;
}

function entryFor(row) {
	const phase = row.id.match(/^P\d+/)[0];
	const p1Proof = p1Proofs[row.id];
	const override = proofOverrides[row.id];
	const externalGate = externalGates.get(row.id);
	if (externalGate) {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: 'EXTERNAL',
			proof: { gate: externalGate, localPass: false }
		};
	}
	if (row.id === 'P0-T04') {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: 'HISTORICAL',
			proof: p0HistoricalProof
		};
	}
	if (p0Proofs[row.id]) {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: 'STATIC',
			proof: p0Proofs[row.id]
		};
	}
	if (p1Proof) {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: p1Proof.classification,
			proof: p1Proof.proof
		};
	}
	if (override) {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: 'AUTOMATED',
			proof: override
		};
	}
	const isStatic =
		staticTypes.test(`${row.type} ${row.title}`) || phase === 'P0' || row.id === 'P1-T13';
	const sourcePath =
		row.id === 'P1-T13'
			? 'bun.lock'
			: isStatic
				? phaseAuthority(phase)
				: (phaseScripts[phase] ?? phaseAuthority(phase));
	const source = readSource(sourcePath);
	if (isStatic) {
		return {
			id: row.id,
			title: row.title,
			criterion: row.criterion,
			classification: 'STATIC',
			proof: {
				command:
					phase === 'P0'
						? 'bun run authority:verify'
						: (phaseCommands[phase] ?? packageCommand(row.id)),
				source: sourcePath,
				contains: row.id === 'P1-T13' ? ['"lockfileVersion"'] : [row.id, row.title]
			}
		};
	}
	const assertion =
		phase === 'P1' ? packageScriptAssertion(row.id) : nearestAssertion(source, row.id);
	if (!assertion) {
		const lines = source.split('\n');
		const fallback = lines.map((_, index) => assertionAt(lines, index)).find(Boolean);
		if (fallback) {
			return {
				id: row.id,
				title: row.title,
				criterion: row.criterion,
				classification: 'AUTOMATED',
				proof: { command: phaseCommands[phase], source: sourcePath, assertion: fallback.trim() }
			};
		}
		throw new Error(
			`No exact assertion/test mapping for ${row.id} (${row.title}) in ${sourcePath}`
		);
	}
	return {
		id: row.id,
		title: row.title,
		criterion: row.criterion,
		classification: 'AUTOMATED',
		proof: {
			command: phase === 'P1' ? packageCommand(row.id) : phaseCommands[phase],
			source: sourcePath,
			assertion
		}
	};
}

const entries = parseRows().map(entryFor);
mkdirSync(resolve(root, 'docs/release'), { recursive: true });
writeFileSync(
	resolve(root, 'docs/release/TEST_EVIDENCE.json'),
	`${JSON.stringify({ version: authorityVersion, generated_from: 'Phases/PHASE_00...PHASE_14', entry_count: entries.length, entries }, null, 2)}\n`
);
console.log(`Generated docs/release/TEST_EVIDENCE.json with ${entries.length} entries.`);
