import { describe, expect, it } from 'vitest';
import { parseEmailAuthReadiness } from './email-auth';

describe('production email authentication readiness', () => {
	it('fails clearly when local or production DNS evidence is absent', () => {
		expect(() => parseEmailAuthReadiness({})).toThrow(/SENDPULSE_SENDER_EMAIL/);
	});

	it('requires sender identity and an explicit verified-domain gate', () => {
		const environment = {
			SENDPULSE_SENDER_EMAIL: 'sales@example.test',
			SENDPULSE_SENDER_DOMAIN: 'example.test',
			SENDPULSE_DKIM_SELECTOR: 'sp',
			SENDPULSE_SPF_RECORD: 'v=spf1 include:provider.example ~all',
			SENDPULSE_DKIM_RECORD: 'v=DKIM1; k=rsa; p=public-key',
			SENDPULSE_DMARC_RECORD: 'v=DMARC1; p=none',
			SENDPULSE_DOMAIN_AUTHENTICATED: 'true'
		};
		expect(parseEmailAuthReadiness(environment).domainAuthenticated).toBe(true);
		expect(() =>
			parseEmailAuthReadiness({ ...environment, SENDPULSE_DOMAIN_AUTHENTICATED: 'false' })
		).toThrow(/pilot DNS verification/);
	});
});
