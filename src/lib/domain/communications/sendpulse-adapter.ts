export type SendPulseRecipient = { email: string; name?: string };

export type SendPulseEmail = {
	to: SendPulseRecipient[];
	subject: string;
	html: string;
	text?: string;
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

export class SendPulseSubmissionUnknownError extends Error {
	constructor(message = 'SendPulse submission acknowledgement was not received') {
		super(message);
		this.name = 'SendPulseSubmissionUnknownError';
	}
}

export class SendPulseAdapter {
	private readonly options: Required<
		Pick<SendPulseAdapterOptions, 'clientId' | 'clientSecret' | 'baseUrl'>
	> & { senderEmail?: string; senderName?: string; fetcher: typeof fetch };

	constructor(options: SendPulseAdapterOptions) {
		this.options = {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			baseUrl: options.baseUrl ?? 'https://api.sendpulse.com',
			senderEmail: options.senderEmail?.trim() || undefined,
			senderName: options.senderName?.trim() || undefined,
			fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis)
		};
	}

	async sendEmail(input: SendPulseEmail): Promise<{ providerMessageId: string }> {
		const senderEmail = input.fromEmail?.trim() || this.options.senderEmail;
		const senderName = input.fromName?.trim() || this.options.senderName;
		if (!senderEmail || !senderName) {
			throw new Error('A configured SendPulse sender email and name are required.');
		}
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
				email: senderEmail,
				name: senderName
			},
			to: input.to
		};
		if (input.text?.trim()) email.text = input.text;
		if (input.attachments?.length) email.attachments = input.attachments;

		let sendResponse: Response;
		try {
			sendResponse = await this.options.fetcher(`${this.options.baseUrl}/smtp/emails`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${tokenBody.access_token}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ email })
			});
		} catch (error) {
			throw new SendPulseSubmissionUnknownError(error instanceof Error ? error.message : undefined);
		}
		let sendBody: SendResponse;
		try {
			sendBody = (await sendResponse.json()) as SendResponse;
		} catch {
			throw new SendPulseSubmissionUnknownError();
		}
		const providerMessageId = sendBody.id ?? sendBody.message_id;
		if (!sendResponse.ok || sendBody.result !== true || providerMessageId === undefined) {
			throw new Error('SendPulse email submission failed');
		}
		return { providerMessageId: String(providerMessageId) };
	}
}
