import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import {
	generateQuoteDocument,
	type QuoteDocumentInput,
	type QuoteDocumentItem,
	type QuoteDocumentQuote
} from '$lib/domain/quotes/document';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';

type ServerSupabaseClient = SupabaseClient<Database>;

type QuoteRow = QuoteDocumentQuote & {
	id: string;
	quote_number: string | null;
	lock_version: number;
	document_path: string | null;
	document_hash: string | null;
	document_generated_at: string | null;
};

type QuoteDocumentArtifact = {
	path: string;
	hash: string;
	generatedAt: string | null;
	lockVersion: number;
	bytes: Uint8Array;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function quoteInput(quote: QuoteRow, items: QuoteDocumentItem[]): QuoteDocumentInput {
	if (!quote.quote_number)
		throw new Error('Quote number is not available for document generation.');
	return {
		quote: {
			quote_number: quote.quote_number,
			subject: quote.subject,
			introduction: quote.introduction,
			terms: quote.terms,
			tax_label: quote.tax_label,
			tax_rate: quote.tax_rate,
			currency: quote.currency,
			valid_until: quote.valid_until,
			subtotal: quote.subtotal,
			tax_amount: quote.tax_amount,
			total: quote.total,
			quote_snapshot: record(quote.quote_snapshot)
		},
		items
	};
}

async function loadQuote(
	supabase: ServerSupabaseClient,
	quoteId: string
): Promise<{ quote: QuoteRow; items: QuoteDocumentItem[] }> {
	const quoteResponse = await supabase
		.from('quotes')
		.select(
			'id,quote_number,subject,introduction,terms,tax_label,tax_rate,currency,valid_until,subtotal,tax_amount,total,quote_snapshot,lock_version,document_path,document_hash,document_generated_at,status'
		)
		.eq('id', quoteId)
		.maybeSingle();
	if (quoteResponse.error) throw new Error(quoteResponse.error.message);
	if (!quoteResponse.data) throw new Error('Quote not found.');
	if (quoteResponse.data.status !== 'ready')
		throw new Error('Only a ready Quote can receive a document.');
	const itemsResponse = await supabase
		.from('quote_items')
		.select('position,name,description,quantity,unit_price,taxable,line_subtotal')
		.eq('quote_id', quoteId)
		.order('position');
	if (itemsResponse.error) throw new Error(itemsResponse.error.message);
	return {
		quote: quoteResponse.data as unknown as QuoteRow,
		items: (itemsResponse.data ?? []) as QuoteDocumentItem[]
	};
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
	let binary = '';
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

async function downloadByPath(path: string): Promise<Uint8Array> {
	const { data, error } = await createTrustedSupabaseClient()
		.storage.from('quote-documents')
		.download(path);
	if (error || !data) throw new Error(error?.message ?? 'Quote document could not be downloaded.');
	return new Uint8Array(await data.arrayBuffer());
}

export async function ensureQuoteDocument(
	supabase: ServerSupabaseClient,
	quoteId: string,
	lockVersion: number
): Promise<QuoteDocumentArtifact> {
	const { quote, items } = await loadQuote(supabase, quoteId);
	if (quote.document_path && quote.document_hash && quote.document_generated_at) {
		return {
			path: quote.document_path,
			hash: quote.document_hash,
			generatedAt: quote.document_generated_at,
			lockVersion: quote.lock_version,
			bytes: await downloadByPath(quote.document_path)
		};
	}
	if (quote.document_path || quote.document_hash || quote.document_generated_at) {
		throw new Error('Quote document metadata is incomplete.');
	}

	const generated = await generateQuoteDocument(quoteInput(quote, items));
	const path = `quotes/${quote.id}/${quote.quote_number}.pdf`;
	const storage = createTrustedSupabaseClient().storage.from('quote-documents');
	const upload = await storage.upload(path, generated.bytes, {
		contentType: 'application/pdf',
		cacheControl: '31536000',
		upsert: false
	});
	if (upload.error && !/already exists|duplicate|409/i.test(upload.error.message)) {
		throw new Error(upload.error.message);
	}
	const attached = await supabase.rpc('attach_quote_document', {
		p_quote_id: quote.id,
		p_lock_version: lockVersion,
		p_document_path: path,
		p_document_hash: generated.hash
	});
	if (attached.error) {
		if (upload.error) {
			// A concurrent request may have won the immutable attach race.  The
			// caller can safely use the already-attached artifact if its hash is
			// the same; otherwise surface the conflict.
			const current = await supabase
				.from('quotes')
				.select('document_path,document_hash,document_generated_at')
				.eq('id', quote.id)
				.maybeSingle();
			if (
				current.data?.document_path === path &&
				current.data.document_hash === generated.hash &&
				current.data.document_generated_at
			) {
				return {
					path,
					hash: generated.hash,
					generatedAt: current.data.document_generated_at,
					lockVersion: quote.lock_version + 1,
					bytes: generated.bytes
				};
			}
		}
		throw new Error(attached.error.message);
	}
	const attachedRecord = record(attached.data);
	return {
		path,
		hash: generated.hash,
		generatedAt:
			typeof attachedRecord.document_generated_at === 'string'
				? attachedRecord.document_generated_at
				: null,
		lockVersion:
			typeof attachedRecord.lock_version === 'number'
				? attachedRecord.lock_version
				: quote.lock_version + 1,
		bytes: generated.bytes
	};
}

export async function quoteDocumentDownload(path: string): Promise<Uint8Array> {
	return downloadByPath(path);
}

export { bytesToBase64 };
