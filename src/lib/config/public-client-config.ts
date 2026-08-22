import { env } from '$env/dynamic/public';
import {
	defaultClientConfiguration,
	parsePublicClientConfiguration,
	type PublicClientConfiguration
} from './client-config';

function loadPublicClientConfiguration(): PublicClientConfiguration {
	const raw = env.PUBLIC_CLIENT_CONFIG_JSON?.trim();
	return parsePublicClientConfiguration(raw || defaultClientConfiguration);
}

export const publicClientConfiguration = loadPublicClientConfiguration();
