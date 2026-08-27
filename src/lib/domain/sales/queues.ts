import type { Tables } from '$lib/types/database';

export const salesQueueKeys = ['enquiries', 'qualification', 'proposals', 'decisions'] as const;
export type SalesQueueKey = (typeof salesQueueKeys)[number];

export type SalesQueueLead = Pick<
	Tables<'leads'>,
	| 'id'
	| 'lead_number'
	| 'first_name'
	| 'last_name'
	| 'company'
	| 'email'
	| 'phone'
	| 'message'
	| 'qualification_notes'
	| 'qualification_started_at'
	| 'qualified_at'
	| 'pipeline_stage'
	| 'attention_state'
	| 'attention_reason'
	| 'lock_version'
	| 'updated_at'
	| 'last_activity_at'
>;

export type SalesQueueQuote = Pick<
	Tables<'quotes'>,
	| 'id'
	| 'lead_id'
	| 'quote_number'
	| 'revision_number'
	| 'status'
	| 'subject'
	| 'currency'
	| 'total'
	| 'lock_version'
	| 'created_at'
	| 'valid_until'
>;

export type SalesQueueQuoteState = 'not_started' | 'draft' | 'ready_to_send' | 'sent' | 'accepted';

export type SalesQueueRow = {
	lead: SalesQueueLead;
	quote: SalesQueueQuote | null;
	quoteState: SalesQueueQuoteState;
};

export type SalesQueueDefinition = {
	stage: 'NEW' | 'QUALIFICATION' | 'PROPOSAL' | 'DECISION';
	title: string;
	description: string;
	emptyMessage: string;
};

export const salesQueueDefinitions: Record<SalesQueueKey, SalesQueueDefinition> = {
	enquiries: {
		stage: 'NEW',
		title: 'New Enquiries',
		description:
			'Review incoming enquiries and start qualification when a person is ready to contact.',
		emptyMessage: 'New website enquiries will appear here.'
	},
	qualification: {
		stage: 'QUALIFICATION',
		title: 'Qualification',
		description: 'Capture enough context to decide which enquiries are ready for a quote.',
		emptyMessage: 'Enquiries being qualified will appear here.'
	},
	proposals: {
		stage: 'PROPOSAL',
		title: 'Quotes to Prepare',
		description: 'Prepare, review, and send the latest quote for each qualified enquiry.',
		emptyMessage: 'Enquiries ready for quote work will appear here.'
	},
	decisions: {
		stage: 'DECISION',
		title: 'Awaiting Feedback',
		description: 'Follow up on the current sent quote and record the customer decision.',
		emptyMessage: 'Enquiries with a current sent quote will appear here.'
	}
};

const quoteStatuses = new Set(['draft', 'ready', 'sent', 'accepted']);

function compareNewest(left: SalesQueueQuote, right: SalesQueueQuote) {
	const createdAt = right.created_at.localeCompare(left.created_at);
	if (createdAt !== 0) return createdAt;
	if (right.revision_number !== left.revision_number) {
		return right.revision_number - left.revision_number;
	}
	return right.id.localeCompare(left.id);
}

function latestActionableQuote(quotes: SalesQueueQuote[]) {
	return quotes.filter((quote) => quoteStatuses.has(quote.status)).sort(compareNewest)[0] ?? null;
}

function quoteState(quote: SalesQueueQuote | null): SalesQueueQuoteState {
	if (!quote) return 'not_started';
	if (quote.status === 'draft') return 'draft';
	if (quote.status === 'ready') return 'ready_to_send';
	if (quote.status === 'accepted') return 'accepted';
	return 'sent';
}

function currentSentQuote(quotes: SalesQueueQuote[]) {
	const latest = latestActionableQuote(quotes);
	return latest?.status === 'sent' ? latest : null;
}

export function deriveSalesQueueRows(
	queue: SalesQueueKey,
	leads: SalesQueueLead[],
	quotes: SalesQueueQuote[]
): SalesQueueRow[] {
	const stage = salesQueueDefinitions[queue].stage;
	const quotesByLead = new Map<string, SalesQueueQuote[]>();
	for (const quote of quotes) {
		const leadQuotes = quotesByLead.get(quote.lead_id) ?? [];
		leadQuotes.push(quote);
		quotesByLead.set(quote.lead_id, leadQuotes);
	}

	return leads
		.filter((lead) => lead.pipeline_stage === stage)
		.map((lead) => {
			const leadQuotes = quotesByLead.get(lead.id) ?? [];
			const quote =
				queue === 'decisions' ? currentSentQuote(leadQuotes) : latestActionableQuote(leadQuotes);
			return { lead, quote, quoteState: quoteState(quote) };
		})
		.filter((row) => queue !== 'decisions' || row.quote?.status === 'sent');
}
