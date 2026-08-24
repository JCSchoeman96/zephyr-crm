import { describe, expect, it } from 'vitest';
import { SendPulseAdapter, SendPulseSubmissionUnknownError } from './sendpulse-adapter';

describe('SendPulse adapter contract', () => {
	it('maps the OAuth and SMTP acknowledgement boundary to a stable result', async () => {
		const requests: Array<{ url: string; body: string }> = [];
		const adapter = new SendPulseAdapter({
			clientId: 'test-client',
			clientSecret: 'test-secret',
			baseUrl: 'https://provider.test',
			senderEmail: 'sales@example.test',
			senderName: 'Example Sales',
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
			senderEmail: 'sales@example.test',
			senderName: 'Example Sales',
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

	it('refuses to submit without an explicit sender identity', async () => {
		const adapter = new SendPulseAdapter({
			clientId: 'test-client',
			clientSecret: 'test-secret',
			baseUrl: 'https://provider.test',
			fetcher: async () => new Response('{}', { status: 200 })
		});

		await expect(
			adapter.sendEmail({
				to: [{ email: 'client@example.test' }],
				subject: 'Quote',
				html: '<p>Quote</p>'
			})
		).rejects.toThrow(/sender email and name/i);
	});

	it('binds the platform fetch implementation when no custom fetcher is provided', async () => {
		const originalFetch = globalThis.fetch;
		const requests: string[] = [];
		globalThis.fetch = async (input) => {
			requests.push(String(input));
			if (String(input).endsWith('/oauth/access_token')) {
				return new Response(JSON.stringify({ access_token: 'bound-token' }), { status: 200 });
			}
			return new Response(JSON.stringify({ result: true, id: 'bound-provider-message' }), {
				status: 200
			});
		};
		try {
			const adapter = new SendPulseAdapter({
				clientId: 'test-client',
				clientSecret: 'test-secret',
				baseUrl: 'https://provider.test',
				senderEmail: 'sales@example.test',
				senderName: 'Example Sales'
			});
			expect(
				await adapter.sendEmail({
					to: [{ email: 'client@example.test' }],
					subject: 'Quote',
					html: '<p>Quote</p>'
				})
			).toEqual({ providerMessageId: 'bound-provider-message' });
			expect(requests).toEqual([
				'https://provider.test/oauth/access_token',
				'https://provider.test/smtp/emails'
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
