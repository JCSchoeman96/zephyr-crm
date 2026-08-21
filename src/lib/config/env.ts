export const trustedEnvironmentKeys = [
	'SUPABASE_URL',
	'SUPABASE_SERVICE_ROLE_KEY',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_API_BASE_URL',
	'SENDPULSE_SENDER_EMAIL',
	'SENDPULSE_SENDER_NAME',
	'SENDPULSE_WEBHOOK_SECRET',
	'SENDPULSE_SENDER_DOMAIN',
	'SENDPULSE_DKIM_SELECTOR',
	'SENDPULSE_SPF_RECORD',
	'SENDPULSE_DKIM_RECORD',
	'SENDPULSE_DMARC_RECORD',
	'SENDPULSE_DOMAIN_AUTHENTICATED',
	'BRICKS_FORM_ID',
	'BRICKS_WEBHOOK_SECRET'
] as const;

type EnvironmentRecord = Record<string, string | undefined>;

export interface PublicEnvironment {
	supabaseUrl: string;
	supabasePublishableKey: string;
	siteUrl: string;
}

function requiredValue(environment: EnvironmentRecord, key: string): string {
	const value = environment[key]?.trim();

	if (!value) {
		throw new Error(`Missing required public environment variable: ${key}`);
	}

	return value;
}

export function parsePublicEnv(environment: EnvironmentRecord): PublicEnvironment {
	return {
		supabaseUrl: requiredValue(environment, 'PUBLIC_SUPABASE_URL'),
		supabasePublishableKey: requiredValue(environment, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
		siteUrl: requiredValue(environment, 'PUBLIC_SITE_URL')
	};
}
