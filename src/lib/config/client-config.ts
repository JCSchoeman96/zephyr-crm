export const CLIENT_CONFIGURATION_VERSION = 1 as const;

export type DateFormat = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';

export type ClientConfiguration = {
	version: typeof CLIENT_CONFIGURATION_VERSION;
	brand: {
		companyName: string;
		logoPath: string;
		colors: {
			primary: string;
			primaryStrong: string;
			accent: string;
		};
	};
	locale: {
		language: string;
		timezone: string;
		currency: string;
		dateFormat: DateFormat;
	};
	quotes: {
		prefix: string;
		taxLabel: string;
		taxRate: number;
		defaultValidityDays: number;
		terms: string;
		bankDetails: string;
	};
	sales: {
		followUpDays: number;
		staleLeadDays: number;
		defaultOwnerEmail: string;
	};
	email: {
		senderEmail: string;
		senderName: string;
		replyTo: string;
		templateIds: Record<string, string>;
	};
	integrations: {
		bricks: {
			formId: string;
			webhookSecretEnvKey: string;
		};
		sendpulse: {
			apiBaseUrl: string;
			senderDomain: string;
			templateIds: Record<string, string>;
			clientIdEnvKey: string;
			clientSecretEnvKey: string;
			webhookSecretEnvKey: string;
		};
	};
};

export type PublicClientConfiguration = Pick<
	ClientConfiguration,
	'version' | 'brand' | 'locale' | 'quotes'
>;

const publicProjectionKeys = {
	root: ['version', 'brand', 'locale', 'quotes'],
	brand: ['companyName', 'logoPath', 'colors'],
	brandColors: ['primary', 'primaryStrong', 'accent'],
	locale: ['language', 'timezone', 'currency', 'dateFormat'],
	quotes: ['prefix', 'taxLabel', 'taxRate', 'defaultValidityDays', 'terms', 'bankDetails']
} as const;

export class ClientConfigurationError extends Error {
	readonly issues: string[];

	constructor(issues: string[] | string) {
		const normalized = typeof issues === 'string' ? [issues] : issues;
		super(`Invalid client configuration: ${normalized.join('; ')}`);
		this.name = 'ClientConfigurationError';
		this.issues = normalized;
	}
}

export const defaultClientConfiguration: ClientConfiguration = {
	version: CLIENT_CONFIGURATION_VERSION,
	brand: {
		companyName: 'Zephyr CRM',
		logoPath: '/favicon.svg',
		colors: {
			primary: '#315cce',
			primaryStrong: '#2649a8',
			accent: '#d9773b'
		}
	},
	locale: {
		language: 'en-ZA',
		timezone: 'Africa/Johannesburg',
		currency: 'ZAR',
		dateFormat: 'dd/MM/yyyy'
	},
	quotes: {
		prefix: 'Q-',
		taxLabel: 'VAT',
		taxRate: 0,
		defaultValidityDays: 30,
		terms: '',
		bankDetails: ''
	},
	sales: {
		followUpDays: 3,
		staleLeadDays: 14,
		defaultOwnerEmail: ''
	},
	email: {
		senderEmail: '',
		senderName: 'Zephyr CRM',
		replyTo: '',
		templateIds: {}
	},
	integrations: {
		bricks: {
			formId: 'aaa03e',
			webhookSecretEnvKey: 'BRICKS_SECRET_REF'
		},
		sendpulse: {
			apiBaseUrl: 'https://api.sendpulse.com',
			senderDomain: '',
			templateIds: {},
			clientIdEnvKey: 'SENDPULSE_ID_REF',
			clientSecretEnvKey: 'SENDPULSE_CREDENTIAL_REF',
			webhookSecretEnvKey: 'SENDPULSE_WEBHOOK_REF'
		}
	}
};

function toPublicClientConfiguration(
	configuration: ClientConfiguration
): PublicClientConfiguration {
	return {
		version: configuration.version,
		brand: configuration.brand,
		locale: configuration.locale,
		quotes: configuration.quotes
	};
}

export const defaultPublicClientConfiguration = toPublicClientConfiguration(
	defaultClientConfiguration
);

type ConfigurationRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ConfigurationRecord {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseInput(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		throw new ClientConfigurationError('configuration must be valid JSON');
	}
}

function assertAllowedKeys(
	value: unknown,
	path: string,
	allowed: readonly string[],
	issues: string[]
): void {
	if (!isRecord(value)) return;
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			issues.push(`${path}.${key} is not allowed in PUBLIC_CLIENT_CONFIG_JSON`);
		}
	}
}

function assertPublicProjectionInput(value: unknown): void {
	const input = parseInput(value);
	if (!isRecord(input)) {
		throw new ClientConfigurationError('public projection must be a JSON object');
	}

	const issues: string[] = [];
	assertAllowedKeys(input, 'public', publicProjectionKeys.root, issues);
	assertAllowedKeys(input.brand, 'public.brand', publicProjectionKeys.brand, issues);
	assertAllowedKeys(
		isRecord(input.brand) ? input.brand.colors : undefined,
		'public.brand.colors',
		publicProjectionKeys.brandColors,
		issues
	);
	assertAllowedKeys(input.locale, 'public.locale', publicProjectionKeys.locale, issues);
	assertAllowedKeys(input.quotes, 'public.quotes', publicProjectionKeys.quotes, issues);
	if (issues.length > 0) throw new ClientConfigurationError(issues);
}

function cloneRecord(value: ConfigurationRecord): ConfigurationRecord {
	return Object.fromEntries(
		Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)])
	);
}

function cloneValue(value: unknown): unknown {
	return isRecord(value)
		? cloneRecord(value)
		: Array.isArray(value)
			? value.map(cloneValue)
			: value;
}

function mergeRecords(
	base: ConfigurationRecord,
	override: ConfigurationRecord
): ConfigurationRecord {
	const result = cloneRecord(base);
	for (const [key, value] of Object.entries(override)) {
		if (isRecord(value) && isRecord(result[key])) {
			result[key] = mergeRecords(result[key] as ConfigurationRecord, value);
		} else {
			result[key] = cloneValue(value);
		}
	}
	return result;
}

function objectAt(root: ConfigurationRecord, path: string, issues: string[]): ConfigurationRecord {
	const value = root[path];
	if (!isRecord(value)) {
		issues.push(`${path} must be an object`);
		return {};
	}
	return value;
}

function required(root: ConfigurationRecord, path: string, issues: string[]): unknown {
	const segments = path.split('.');
	let current: unknown = root;
	for (const segment of segments) {
		if (!isRecord(current) || !(segment in current)) {
			issues.push(`${path} is required`);
			return undefined;
		}
		current = current[segment];
	}
	return current;
}

function text(
	value: unknown,
	path: string,
	issues: string[],
	options: { max: number; min?: number; pattern?: RegExp; allowEmpty?: boolean }
): string {
	if (typeof value !== 'string') {
		issues.push(`${path} must be a string`);
		return '';
	}
	const normalized = value.trim();
	if (!options.allowEmpty && normalized.length < (options.min ?? 1)) {
		issues.push(`${path} must contain at least ${options.min ?? 1} character(s)`);
	}
	if (normalized.length > options.max)
		issues.push(`${path} must be at most ${options.max} characters`);
	if (options.pattern && normalized && !options.pattern.test(normalized)) {
		issues.push(`${path} has an invalid format`);
	}
	return normalized;
}

function number(
	value: unknown,
	path: string,
	issues: string[],
	minimum: number,
	maximum: number
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		issues.push(`${path} must be a finite number`);
		return minimum;
	}
	if (value < minimum || value > maximum) {
		issues.push(`${path} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

function email(value: unknown, path: string, issues: string[]): string {
	const normalized = text(value, path, issues, { max: 254, allowEmpty: true });
	if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		issues.push(`${path} must be a valid email address`);
	}
	return normalized;
}

function templateIds(value: unknown, path: string, issues: string[]): Record<string, string> {
	if (!isRecord(value)) {
		issues.push(`${path} must be an object`);
		return {};
	}
	const result: Record<string, string> = {};
	for (const [key, templateId] of Object.entries(value)) {
		if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key)) issues.push(`${path}.${key} has an invalid key`);
		result[key] = text(templateId, `${path}.${key}`, issues, { max: 160, allowEmpty: true });
	}
	return result;
}

function assertNoInlineSecrets(value: unknown, path: string, issues: string[]): void {
	if (Array.isArray(value)) {
		value.forEach((item, index) => assertNoInlineSecrets(item, `${path}[${index}]`, issues));
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, nested] of Object.entries(value)) {
		const isEnvironmentReference = /(?:env|environment)[_-]?key$/i.test(key);
		if (
			!isEnvironmentReference &&
			/(?:password|token|private[_-]?key|service[_-]?role|client[_-]?secret|webhook[_-]?secret)/i.test(
				key
			)
		) {
			issues.push(`${path}.${key} must reference an environment variable, not contain a secret`);
		}
		if (typeof nested === 'string' && /-----BEGIN|^eyJ[A-Za-z0-9_-]+\./.test(nested.trim())) {
			issues.push(`${path}.${key} appears to contain a credential`);
		}
		assertNoInlineSecrets(nested, `${path}.${key}`, issues);
	}
}

function assertTimezone(value: string, path: string, issues: string[]): void {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
	} catch {
		issues.push(`${path} must be a valid IANA timezone`);
	}
}

function assertUrl(value: string, path: string, issues: string[]): void {
	try {
		const url = new URL(value);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
			issues.push(`${path} must be an http(s) URL without credentials`);
		}
	} catch {
		issues.push(`${path} must be an http(s) URL`);
	}
}

function assertEnvironmentKey(
	value: unknown,
	path: string,
	issues: string[],
	approvedKeys?: readonly string[]
): void {
	if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(value)) {
		issues.push(`${path} must name an approved trusted environment variable`);
		return;
	}
	if (approvedKeys && !approvedKeys.includes(value)) {
		issues.push(`${path} must name an approved trusted environment variable`);
	}
}

function parseConfiguration(
	value: unknown,
	applyDefaults: boolean,
	approvedEnvironmentKeys?: readonly string[]
): ClientConfiguration {
	const input = parseInput(value);
	if (!isRecord(input)) throw new ClientConfigurationError('configuration must be a JSON object');
	const root = applyDefaults
		? mergeRecords(defaultClientConfiguration as unknown as ConfigurationRecord, input)
		: input;
	const issues: string[] = [];
	assertNoInlineSecrets(input, 'client', issues);

	const version = required(root, 'version', issues);
	if (version !== CLIENT_CONFIGURATION_VERSION) {
		issues.push(`version must be ${CLIENT_CONFIGURATION_VERSION}`);
	}

	const brand = objectAt(root, 'brand', issues);
	const companyName = text(
		required(root, 'brand.companyName', issues),
		'brand.companyName',
		issues,
		{
			max: 120
		}
	);
	const logoPath = text(required(root, 'brand.logoPath', issues), 'brand.logoPath', issues, {
		max: 500,
		pattern: /^(?:\/(?!\/)|https:\/\/)/
	});
	objectAt(brand, 'colors', issues);
	const primary = text(
		required(root, 'brand.colors.primary', issues),
		'brand.colors.primary',
		issues,
		{
			max: 9,
			pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
		}
	);
	const primaryStrong = text(
		required(root, 'brand.colors.primaryStrong', issues),
		'brand.colors.primaryStrong',
		issues,
		{ max: 9, pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i }
	);
	const accent = text(
		required(root, 'brand.colors.accent', issues),
		'brand.colors.accent',
		issues,
		{
			max: 9,
			pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
		}
	);

	objectAt(root, 'locale', issues);
	const language = text(required(root, 'locale.language', issues), 'locale.language', issues, {
		max: 35,
		pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/
	});
	const timezone = text(required(root, 'locale.timezone', issues), 'locale.timezone', issues, {
		max: 80
	});
	assertTimezone(timezone, 'locale.timezone', issues);
	const currency = text(required(root, 'locale.currency', issues), 'locale.currency', issues, {
		max: 3,
		pattern: /^[A-Z]{3}$/
	});
	const dateFormat = text(
		required(root, 'locale.dateFormat', issues),
		'locale.dateFormat',
		issues,
		{
			max: 10,
			pattern: /^(?:dd\/MM\/yyyy|MM\/dd\/yyyy|yyyy-MM-dd)$/
		}
	) as DateFormat;

	objectAt(root, 'quotes', issues);
	const prefix = text(required(root, 'quotes.prefix', issues), 'quotes.prefix', issues, {
		max: 12,
		pattern: /^[A-Z0-9-]+$/
	});
	const taxLabel = text(required(root, 'quotes.taxLabel', issues), 'quotes.taxLabel', issues, {
		max: 40
	});
	const taxRate = number(
		required(root, 'quotes.taxRate', issues),
		'quotes.taxRate',
		issues,
		0,
		100
	);
	const defaultValidityDays = number(
		required(root, 'quotes.defaultValidityDays', issues),
		'quotes.defaultValidityDays',
		issues,
		1,
		365
	);
	const terms = text(required(root, 'quotes.terms', issues), 'quotes.terms', issues, {
		max: 10000,
		allowEmpty: true
	});
	const bankDetails = text(
		required(root, 'quotes.bankDetails', issues),
		'quotes.bankDetails',
		issues,
		{
			max: 5000,
			allowEmpty: true
		}
	);

	objectAt(root, 'sales', issues);
	const followUpDays = number(
		required(root, 'sales.followUpDays', issues),
		'sales.followUpDays',
		issues,
		0,
		365
	);
	const staleLeadDays = number(
		required(root, 'sales.staleLeadDays', issues),
		'sales.staleLeadDays',
		issues,
		1,
		3650
	);
	const defaultOwnerEmail = email(
		required(root, 'sales.defaultOwnerEmail', issues),
		'sales.defaultOwnerEmail',
		issues
	);

	objectAt(root, 'email', issues);
	const senderEmail = email(
		required(root, 'email.senderEmail', issues),
		'email.senderEmail',
		issues
	);
	const senderName = text(required(root, 'email.senderName', issues), 'email.senderName', issues, {
		max: 120
	});
	const replyTo = email(required(root, 'email.replyTo', issues), 'email.replyTo', issues);
	const emailTemplateIds = templateIds(
		required(root, 'email.templateIds', issues),
		'email.templateIds',
		issues
	);

	const integrations = objectAt(root, 'integrations', issues);
	objectAt(integrations, 'bricks', issues);
	const bricksFormId = text(
		required(root, 'integrations.bricks.formId', issues),
		'integrations.bricks.formId',
		issues,
		{ max: 120, pattern: /^[A-Za-z0-9._-]+$/ }
	);
	const bricksWebhookSecretEnvKey = required(
		root,
		'integrations.bricks.webhookSecretEnvKey',
		issues
	);
	assertEnvironmentKey(
		bricksWebhookSecretEnvKey,
		'integrations.bricks.webhookSecretEnvKey',
		issues,
		approvedEnvironmentKeys
	);

	objectAt(integrations, 'sendpulse', issues);
	const sendpulseApiBaseUrl = text(
		required(root, 'integrations.sendpulse.apiBaseUrl', issues),
		'integrations.sendpulse.apiBaseUrl',
		issues,
		{ max: 300 }
	);
	assertUrl(sendpulseApiBaseUrl, 'integrations.sendpulse.apiBaseUrl', issues);
	const senderDomain = text(
		required(root, 'integrations.sendpulse.senderDomain', issues),
		'integrations.sendpulse.senderDomain',
		issues,
		{ max: 253, allowEmpty: true, pattern: /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i }
	).toLowerCase();
	const sendpulseTemplateIds = templateIds(
		required(root, 'integrations.sendpulse.templateIds', issues),
		'integrations.sendpulse.templateIds',
		issues
	);
	const clientIdEnvKey = required(root, 'integrations.sendpulse.clientIdEnvKey', issues);
	const clientSecretEnvKey = required(root, 'integrations.sendpulse.clientSecretEnvKey', issues);
	const sendpulseWebhookSecretEnvKey = required(
		root,
		'integrations.sendpulse.webhookSecretEnvKey',
		issues
	);
	assertEnvironmentKey(
		clientIdEnvKey,
		'integrations.sendpulse.clientIdEnvKey',
		issues,
		approvedEnvironmentKeys
	);
	assertEnvironmentKey(
		clientSecretEnvKey,
		'integrations.sendpulse.clientSecretEnvKey',
		issues,
		approvedEnvironmentKeys
	);
	assertEnvironmentKey(
		sendpulseWebhookSecretEnvKey,
		'integrations.sendpulse.webhookSecretEnvKey',
		issues,
		approvedEnvironmentKeys
	);

	if (issues.length > 0) throw new ClientConfigurationError(issues);

	return {
		version: CLIENT_CONFIGURATION_VERSION,
		brand: { companyName, logoPath, colors: { primary, primaryStrong, accent } },
		locale: { language, timezone, currency, dateFormat },
		quotes: { prefix, taxLabel, taxRate, defaultValidityDays, terms, bankDetails },
		sales: { followUpDays, staleLeadDays, defaultOwnerEmail },
		email: { senderEmail, senderName, replyTo, templateIds: emailTemplateIds },
		integrations: {
			bricks: {
				formId: bricksFormId,
				webhookSecretEnvKey:
					bricksWebhookSecretEnvKey as ClientConfiguration['integrations']['bricks']['webhookSecretEnvKey']
			},
			sendpulse: {
				apiBaseUrl: sendpulseApiBaseUrl,
				senderDomain,
				templateIds: sendpulseTemplateIds,
				clientIdEnvKey:
					clientIdEnvKey as ClientConfiguration['integrations']['sendpulse']['clientIdEnvKey'],
				clientSecretEnvKey:
					clientSecretEnvKey as ClientConfiguration['integrations']['sendpulse']['clientSecretEnvKey'],
				webhookSecretEnvKey:
					sendpulseWebhookSecretEnvKey as ClientConfiguration['integrations']['sendpulse']['webhookSecretEnvKey']
			}
		}
	};
}

export function parseClientConfiguration(
	value: unknown,
	options: { trustedEnvironmentKeys?: readonly string[] } = {}
): ClientConfiguration {
	return parseConfiguration(value, false, options.trustedEnvironmentKeys);
}

export function parsePublicClientConfiguration(
	value: unknown = defaultPublicClientConfiguration
): PublicClientConfiguration {
	assertPublicProjectionInput(value);
	const configuration = parseConfiguration(value, true);
	return toPublicClientConfiguration(configuration);
}
