import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { quoteDocumentDownload } from '$lib/server/quote-documents';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { profile } = await locals.getAuthState();
	if (!locals.supabase || !profile || profile.status !== 'active') {
		return json({ error: 'Authentication required' }, { status: 401 });
	}
	const quote = await locals.supabase
		.from('quotes')
		.select('quote_number,document_path,document_hash')
		.eq('id', params.id)
		.maybeSingle();
	if (quote.error) return json({ error: quote.error.message }, { status: 500 });
	if (!quote.data?.document_path || !quote.data.document_hash) {
		return json({ error: 'Quote document not found' }, { status: 404 });
	}
	try {
		const bytes = await quoteDocumentDownload(quote.data.document_path, quote.data.document_hash);
		return new Response(bytes.slice().buffer as ArrayBuffer, {
			status: 200,
			headers: {
				'content-type': 'application/pdf',
				'content-length': String(bytes.byteLength),
				'content-disposition': `attachment; filename="${quote.data.quote_number ?? 'quote'}.pdf"`,
				'cache-control': 'private, no-store'
			}
		});
	} catch {
		return json({ error: 'Quote document could not be retrieved' }, { status: 404 });
	}
};
