type EnvironmentRecord = Record<string, string | undefined>;

export type EmailAuthReadiness = {
	senderEmail: string;
	senderDomain: string;
	dkimSelector: string;
	spfRecord: string;
	dkimRecord: string;
	dmarcRecord: string;
	domainAuthenticated: true;
};

function value(environment: EnvironmentRecord, key: string): string {
	return environment[key]?.trim() ?? '';
}

export function parseEmailAuthReadiness(environment: EnvironmentRecord): EmailAuthReadiness {
	const required = [
		'SENDPULSE_SENDER_EMAIL',
		'SENDPULSE_SENDER_DOMAIN',
		'SENDPULSE_DKIM_SELECTOR',
		'SENDPULSE_SPF_RECORD',
		'SENDPULSE_DKIM_RECORD',
		'SENDPULSE_DMARC_RECORD'
	];
	const missing = required.filter((key) => !value(environment, key));
	if (missing.length > 0) {
		throw new Error(`Missing production email authentication configuration: ${missing.join(', ')}`);
	}
	const senderEmail = value(environment, 'SENDPULSE_SENDER_EMAIL');
	const senderDomain = value(environment, 'SENDPULSE_SENDER_DOMAIN').toLowerCase();
	const emailDomain = senderEmail.split('@').at(-1)?.toLowerCase();
	if (!emailDomain || emailDomain !== senderDomain) {
		throw new Error('SENDPULSE_SENDER_EMAIL must belong to SENDPULSE_SENDER_DOMAIN.');
	}
	if (value(environment, 'SENDPULSE_DOMAIN_AUTHENTICATED').toLowerCase() !== 'true') {
		throw new Error('SENDPULSE_DOMAIN_AUTHENTICATED must be true after pilot DNS verification.');
	}
	return {
		senderEmail,
		senderDomain,
		dkimSelector: value(environment, 'SENDPULSE_DKIM_SELECTOR'),
		spfRecord: value(environment, 'SENDPULSE_SPF_RECORD'),
		dkimRecord: value(environment, 'SENDPULSE_DKIM_RECORD'),
		dmarcRecord: value(environment, 'SENDPULSE_DMARC_RECORD'),
		domainAuthenticated: true
	};
}
