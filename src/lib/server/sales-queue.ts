import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import {
	deriveSalesQueueRows,
	salesQueueDefinitions,
	type SalesQueueDefinition,
	type SalesQueueKey,
	type SalesQueueLead,
	type SalesQueueQuote,
	type SalesQueueRow
} from '$lib/domain/sales/queues';

export const salesQueueLimits = {
	leads: 50,
	quotes: 250
} as const;

const leadSelect =
	'id,lead_number,first_name,last_name,company,email,phone,message,qualification_notes,qualification_started_at,qualified_at,pipeline_stage,attention_state,attention_reason,lock_version,updated_at,last_activity_at';
const quoteSelect =
	'id,lead_id,quote_number,revision_number,status,subject,currency,total,lock_version,created_at,valid_until';

export type SalesQueueResult = {
	key: SalesQueueKey;
	definition: SalesQueueDefinition;
	rows: SalesQueueRow[];
	leadCount: number;
	limits: typeof salesQueueLimits;
};

export async function loadSalesQueue(
	supabase: SupabaseClient<Database>,
	key: SalesQueueKey
): Promise<SalesQueueResult> {
	const definition = salesQueueDefinitions[key];
	const leadResponse = await supabase
		.from('leads')
		.select(leadSelect)
		.eq('pipeline_stage', definition.stage)
		.order('updated_at', { ascending: false })
		.order('id', { ascending: true })
		.range(0, salesQueueLimits.leads - 1);
	if (leadResponse.error) throw error(500, 'Could not load the Sales queue');

	const leads = (leadResponse.data ?? []) as SalesQueueLead[];
	let quotes: SalesQueueQuote[] = [];
	if ((key === 'proposals' || key === 'decisions') && leads.length > 0) {
		const quoteResponse = await supabase
			.from('quotes')
			.select(quoteSelect)
			.in(
				'lead_id',
				leads.map((lead) => lead.id)
			)
			.in('status', ['draft', 'ready', 'sent', 'accepted'])
			.order('created_at', { ascending: false })
			.order('revision_number', { ascending: false })
			.limit(salesQueueLimits.quotes);
		if (quoteResponse.error) throw error(500, 'Could not load Sales proposal details');
		quotes = (quoteResponse.data ?? []) as SalesQueueQuote[];
	}

	return {
		key,
		definition,
		rows: deriveSalesQueueRows(key, leads, quotes),
		leadCount: leads.length,
		limits: salesQueueLimits
	};
}
