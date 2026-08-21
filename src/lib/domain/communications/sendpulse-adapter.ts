export type SendPulseRecipient = { email: string; name?: string };

export type SendPulseEmail = {
	to: SendPulseRecipient[];
	subject: string;
	html: string;
	fromEmail?: string;
	fromName?: string;
	attachments?: SendPulseAttachment[];
};

export type SendPulseAttachment = {
	name: string;
	content: string;
};

type SendPulseAdapterOptions = {
	clientId: string;
	clientSecret: string;
	baseUrl?: string;
	senderEmail?: string;
	senderName?: string;
	fetcher?: typeof fetch;
};

type TokenResponse = { access_token?: string };
type SendResponse = { result?: boolean; id?: string | number; message_id?: string | number };

export class SendPulseAdapter {
	private readonly options: Required<
		Pick<
			SendPulseAdapterOptions,
			'clientId' | 'clientSecret' | 'baseUrl' | 'senderEmail' | 'senderName'
		>
	> & { fetcher: typeof fetch };

	constructor(options: SendPulseAdapterOptions) {
		this.options = {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			baseUrl: options.baseUrl ?? 'https://api.sendpulse.com',
			senderEmail: options.senderEmail ?? 'no-reply@example.invalid',
			senderName: options.senderName ?? 'Zephyr CRM',
			fetcher: options.fetcher ?? fetch
		};
	}

	async sendEmail(input: SendPulseEmail): Promise<{ providerMessageId: string }> {
		const tokenResponse = await this.options.fetcher(`${this.options.baseUrl}/oauth/access_token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				grant_type: 'client_credentials',
				client_id: this.options.clientId,
				client_secret: this.options.clientSecret
			})
		});
		const tokenBody = (await tokenResponse.json()) as TokenResponse;
		if (!tokenResponse.ok || !tokenBody.access_token) {
			throw new Error('SendPulse authentication failed');
		}

		const email: Record<string, unknown> = {
			html: input.html,
			subject: input.subject,
			from: {
				email: input.fromEmail ?? this.options.senderEmail,
				name: input.fromName ?? this.options.senderName
			},
			to: input.to
		};
		if (input.attachments?.length) email.attachments = input.attachments;

		const sendResponse = await this.options.fetcher(`${this.options.baseUrl}/smtp/emails`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tokenBody.access_token}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email })
		});
		const sendBody = (await sendResponse.json()) as SendResponse;
		const providerMessageId = sendBody.id ?? sendBody.message_id;
		if (!sendResponse.ok || sendBody.result !== true || providerMessageId === undefined) {
			throw new Error('SendPulse email submission failed');
		}
		return { providerMessageId: String(providerMessageId) };
	}
}
