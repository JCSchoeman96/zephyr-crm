import { describe, expect, it } from 'vitest';
import { SendPulseAdapter, SendPulseSubmissionUnknownError } from './sendpulse-adapter';

describe('SendPulse adapter contract', () => {
	it('maps the OAuth and SMTP acknowledgement boundary to a stable result', async () => {
		const requests: Array<{ url: string; body: string }> = [];
		const adapter = new SendPulseAdapter({
			clientId: 'test-client',
			clientSecret: 'test-secret',
			baseUrl: 'https://provider.test',
			fetcher: async (input, init) => {
				requests.push({ url: String(input), body: String(init?.body ?? '') });
				if (String(input).endsWith('/oauth/access_token')) {
					return new Response(JSON.stringify({ access_token: 'contract-token' }), { status: 200 });
				}
				return new Response(JSON.stringify({ result: true, id: 'provider-message-123' }), {
					status: 200
				});
			}
		});

		expect(
			await adapter.sendEmail({
				to: [{ email: 'client@example.test', name: 'Client' }],
				subject: 'Quote Q-1001',
				html: '<p>Quote</p>'
			})
		).toEqual({ providerMessageId: 'provider-message-123' });
		expect(requests.map((request) => request.url)).toEqual([
			'https://provider.test/oauth/access_token',
			'https://provider.test/smtp/emails'
		]);
	});

	it('does not convert a lost SMTP acknowledgement into a definitive failure', async () => {
		const adapter = new SendPulseAdapter({
			clientId: 'test-client',
			clientSecret: 'test-secret',
			baseUrl: 'https://provider.test',
			fetcher: async (input) => {
				if (String(input).endsWith('/oauth/access_token')) {
					return new Response(JSON.stringify({ access_token: 'contract-token' }), { status: 200 });
				}
				throw new Error('connection reset after request transmission');
			}
		});

		await expect(
			adapter.sendEmail({
				to: [{ email: 'client@example.test' }],
				subject: 'Quote',
				html: '<p>Quote</p>'
			})
		).rejects.toBeInstanceOf(SendPulseSubmissionUnknownError);
	});
});
