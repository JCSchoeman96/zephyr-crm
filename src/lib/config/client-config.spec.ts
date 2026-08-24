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

	it('returns only the explicitly browser-safe configuration subset', () => {
		const configuration = parsePublicClientConfiguration({
			brand: { ...defaultClientConfiguration.brand, companyName: 'Browser Client' },
			locale: { ...defaultClientConfiguration.locale, currency: 'GBP' },
			quotes: { ...defaultClientConfiguration.quotes, taxRate: 20 }
		});

		expect(Object.keys(configuration).sort()).toEqual(['brand', 'locale', 'quotes', 'version']);
		expect(Object.keys(configuration.quotes).sort()).toEqual([
			'bankDetails',
			'defaultValidityDays',
			'prefix',
			'taxLabel',
			'taxRate',
			'terms'
		]);
		expect(configuration.brand.companyName).toBe('Browser Client');
		expect(configuration.locale.currency).toBe('GBP');
		expect(configuration.quotes.taxRate).toBe(20);
		expect('sales' in configuration).toBe(false);
		expect('email' in configuration).toBe(false);
		expect('integrations' in configuration).toBe(false);
		expect(JSON.stringify(configuration)).not.toMatch(
			/SUPABASE|SENDPULSE|BRICKS|WEBHOOK|SECRET|ROLE|STATUS|total|price/i
		);
	});

	it('rejects trusted configuration sections from public JSON', () => {
		expect(() => parsePublicClientConfiguration(defaultClientConfiguration)).toThrow(
			/PUBLIC_CLIENT_CONFIG_JSON/
		);
	});
});
