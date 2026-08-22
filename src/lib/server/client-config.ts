import { env } from '$env/dynamic/private';
import {
	defaultClientConfiguration,
	parseClientConfiguration,
	type ClientConfiguration
} from '$lib/config/client-config';

const trustedEnvironmentKeys = [
	'BRICKS_WEBHOOK_SECRET',
	'SENDPULSE_CLIENT_ID',
	'SENDPULSE_CLIENT_SECRET',
	'SENDPULSE_WEBHOOK_SECRET'
] as const;

const defaultTrustedClientConfiguration: ClientConfiguration = {
	...defaultClientConfiguration,
	integrations: {
		...defaultClientConfiguration.integrations,
		bricks: {
			...defaultClientConfiguration.integrations.bricks,
			webhookSecretEnvKey: 'BRICKS_WEBHOOK_SECRET'
		},
		sendpulse: {
			...defaultClientConfiguration.integrations.sendpulse,
			clientIdEnvKey: 'SENDPULSE_CLIENT_ID',
			clientSecretEnvKey: 'SENDPULSE_CLIENT_SECRET',
			webhookSecretEnvKey: 'SENDPULSE_WEBHOOK_SECRET'
		}
	}
};

export type TrustedClientConfiguration = {
	configuration: ClientConfiguration;
	secrets: {
		bricksWebhookSecret: string;
		sendpulseClientId: string;
		sendpulseClientSecret: string;
		sendpulseWebhookSecret: string;
	};
};

export function loadTrustedClientConfiguration(): TrustedClientConfiguration {
	const raw = env.CLIENT_CONFIG_JSON?.trim();
	const configuration = parseClientConfiguration(raw || defaultTrustedClientConfiguration, {
		trustedEnvironmentKeys
	});
	const trusted = {
		bricksWebhookSecret: env[configuration.integrations.bricks.webhookSecretEnvKey]?.trim() ?? '',
		sendpulseClientId: env[configuration.integrations.sendpulse.clientIdEnvKey]?.trim() ?? '',
		sendpulseClientSecret:
			env[configuration.integrations.sendpulse.clientSecretEnvKey]?.trim() ?? '',
		sendpulseWebhookSecret:
			env[configuration.integrations.sendpulse.webhookSecretEnvKey]?.trim() ?? ''
	};

	return { configuration, secrets: trusted };
}
