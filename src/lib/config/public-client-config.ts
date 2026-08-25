import { env } from '$env/dynamic/public';
import {
	defaultPublicClientConfiguration,
	parsePublicClientConfiguration,
	type PublicClientConfiguration
} from './client-config';

function loadPublicClientConfiguration(): PublicClientConfiguration {
	const raw = env.PUBLIC_CLIENT_CONFIG_JSON?.trim();
	return parsePublicClientConfiguration(raw || defaultPublicClientConfiguration);
}

export const publicClientConfiguration = loadPublicClientConfiguration();
