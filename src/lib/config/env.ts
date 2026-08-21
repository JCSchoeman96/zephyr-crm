export const trustedEnvironmentKeys = [
	'SUPABASE_SERVICE_ROLE_KEY',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
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
