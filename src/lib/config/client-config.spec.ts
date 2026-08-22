import { describe, expect, it } from 'vitest';
import {
	ClientConfigurationError,
	defaultClientConfiguration,
	parseClientConfiguration,
	parsePublicClientConfiguration
} from './client-config';

describe('client configuration contract', () => {
	it('parses the complete non-secret template', () => {
		const configuration = parseClientConfiguration({
			...defaultClientConfiguration,
			brand: { ...defaultClientConfiguration.brand, companyName: 'Configured Client' },
			quotes: { ...defaultClientConfiguration.quotes, prefix: 'ACME-' }
		});

		expect(configuration.brand.companyName).toBe('Configured Client');
		expect(configuration.quotes.prefix).toBe('ACME-');
	});

	it('fails clearly for missing sections and inline secrets', () => {
		expect(() => parseClientConfiguration({ version: 1 })).toThrow(/brand/);
		expect(() =>
			parseClientConfiguration({
				...defaultClientConfiguration,
				sendpulseClientSecret: 'do-not-store'
			})
		).toThrow(ClientConfigurationError);
	});

	it('returns only the browser-safe configuration subset', () => {
		const configuration = parsePublicClientConfiguration({
			brand: { ...defaultClientConfiguration.brand, companyName: 'Browser Client' },
			locale: { ...defaultClientConfiguration.locale, currency: 'GBP' },
			quotes: { ...defaultClientConfiguration.quotes, taxRate: 20 }
		});

		expect(configuration.brand.companyName).toBe('Browser Client');
		expect(configuration.locale.currency).toBe('GBP');
		expect(configuration.quotes.taxRate).toBe(20);
		expect('integrations' in configuration).toBe(false);
	});
});
