import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { buildQuotePresentationModel } from '$lib/domain/quotes/documents/presentation-model';
import type {
	QuotePresentationItemInput,
	QuotePresentationQuote
} from '$lib/domain/quotes/documents/presentation-model';
import { generateProfessionalQuoteDocument } from '$lib/domain/quotes/documents/pdf-v2';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';

type ServerSupabaseClient = SupabaseClient<Database>;

type StaticAssetFetcher = {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type QuoteDocumentOptions = {
	assets?: StaticAssetFetcher;
};

type QuoteRow = QuotePresentationQuote & {
	id: string;
	lock_version: number;
	document_path: string | null;
	document_hash: string | null;
	document_mime_type: string | null;
	document_generated_at: string | null;
};

type QuoteDocumentArtifact = {
	path: string;
	hash: string;
	mimeType: string;
	generatedAt: string | null;
	lockVersion: number;
	bytes: Uint8Array;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

async function loadQuote(
	supabase: ServerSupabaseClient,
	quoteId: string
): Promise<{ quote: QuoteRow; items: QuotePresentationItemInput[] }> {
	const quoteResponse = await supabase
		.from('quotes')
		.select(
			'id,quote_number,base_quote_number,revision_number,created_at,subject,introduction,terms,tax_label,tax_rate,currency,valid_until,subtotal,tax_amount,total,quote_snapshot,document_template_version,document_generator_version,lock_version,document_path,document_hash,document_mime_type,document_generated_at,status'
		)
		.eq('id', quoteId)
		.maybeSingle();
	if (quoteResponse.error) throw new Error(quoteResponse.error.message);
	if (!quoteResponse.data) throw new Error('Quote not found.');
	if (quoteResponse.data.status !== 'ready')
		throw new Error('Only a ready Quote can receive a document.');
	const itemsResponse = await supabase
		.from('quote_items')
		.select(
			'position,name,description,quantity,unit_price,taxable,line_subtotal,product_code_snapshot,unit_label_snapshot'
		)
		.eq('quote_id', quoteId)
		.order('position');
	if (itemsResponse.error) throw new Error(itemsResponse.error.message);
	return {
		quote: quoteResponse.data as unknown as QuoteRow,
		items: (itemsResponse.data ?? []) as unknown as QuotePresentationItemInput[]
	};
}

async function presentationModel(
	supabase: ServerSupabaseClient,
	quote: QuoteRow,
	items: QuotePresentationItemInput[],
	assets?: StaticAssetFetcher
) {
	const settingsResponse = await supabase
		.from('app_settings')
		.select('setting_key,setting_value')
		.in('setting_key', ['company_identity', 'quote_defaults']);
	if (settingsResponse.error) throw new Error(settingsResponse.error.message);
	const settings = new Map(
		(settingsResponse.data ?? []).map((setting) => [setting.setting_key, setting.setting_value])
	);
	const model = buildQuotePresentationModel({
		quote,
		items,
		companyIdentity: settings.get('company_identity'),
		quoteDefaults: settings.get('quote_defaults')
	});
	return {
		...model,
		brand: {
			...model.brand,
			logoAsset: await resolveLogoAsset(model.brand.logoAsset, assets)
		}
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

const MAX_STATIC_LOGO_BYTES = 1024 * 1024;

export async function resolveLogoAsset(
	value: string | null,
	assets: StaticAssetFetcher | undefined
): Promise<string | null> {
	const candidate = value?.trim() ?? '';
	if (!candidate) return null;
	if (/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/i.test(candidate)) {
		return candidate;
	}
	if (!assets || !/^\/(?!\/)/.test(candidate)) return null;

	try {
		const response = await assets.fetch(
			new Request(new URL(candidate, 'https://zephyr-crm.invalid'))
		);
		if (!response.ok) return null;
		const contentType = (response.headers.get('content-type') ?? '')
			.split(';', 1)[0]
			.trim()
			.toLowerCase();
		if (contentType !== 'image/png' && contentType !== 'image/jpeg') return null;
		const declaredLength = Number(response.headers.get('content-length'));
		if (Number.isFinite(declaredLength) && declaredLength > MAX_STATIC_LOGO_BYTES) return null;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > MAX_STATIC_LOGO_BYTES) return null;
		return `data:${contentType};base64,${await bytesToBase64(bytes)}`;
	} catch {
		return null;
	}
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const safeBytes = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', safeBytes.buffer as ArrayBuffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function downloadByPath(path: string, expectedHash?: string): Promise<Uint8Array> {
	const { data, error } = await createTrustedSupabaseClient()
		.storage.from('quote-documents')
		.download(path);
	if (error || !data) throw new Error(error?.message ?? 'Quote document could not be downloaded.');
	const bytes = new Uint8Array(await data.arrayBuffer());
	if (expectedHash && (await sha256(bytes)) !== expectedHash.toLowerCase()) {
		throw new Error('Quote document storage hash does not match immutable metadata.');
	}
	return bytes;
}

export async function ensureQuoteDocument(
	supabase: ServerSupabaseClient,
	quoteId: string,
	lockVersion: number,
	options: QuoteDocumentOptions = {}
): Promise<QuoteDocumentArtifact> {
	const { quote, items } = await loadQuote(supabase, quoteId);
	if (quote.document_path && quote.document_hash && quote.document_generated_at) {
		return {
			path: quote.document_path,
			hash: quote.document_hash,
			mimeType: quote.document_mime_type ?? 'application/pdf',
			generatedAt: quote.document_generated_at,
			lockVersion: quote.lock_version,
			bytes: await downloadByPath(quote.document_path, quote.document_hash)
		};
	}
	if (quote.document_path || quote.document_hash || quote.document_generated_at) {
		throw new Error('Quote document metadata is incomplete.');
	}

	const generated = await generateProfessionalQuoteDocument(
		await presentationModel(supabase, quote, items, options.assets)
	);
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
	const storedBytes = upload.error ? await downloadByPath(path, generated.hash) : generated.bytes;
	const attached = await supabase.rpc('attach_quote_document', {
		p_quote_id: quote.id,
		p_lock_version: lockVersion,
		p_document_path: path,
		p_document_hash: generated.hash
	});
	if (attached.error) {
		// A concurrent request may have won the immutable attach race.  The
		// caller can safely use the already-attached artifact if its hash is
		// the same; otherwise surface the conflict.
		const current = await supabase
			.from('quotes')
			.select('document_path,document_hash,document_mime_type,document_generated_at')
			.eq('id', quote.id)
			.maybeSingle();
		if (
			current.data?.document_path === path &&
			current.data.document_hash === generated.hash &&
			current.data.document_generated_at
		) {
			const bytes = await downloadByPath(path, current.data.document_hash);
			return {
				path,
				hash: generated.hash,
				mimeType: current.data.document_mime_type ?? 'application/pdf',
				generatedAt: current.data.document_generated_at,
				lockVersion: quote.lock_version + 1,
				bytes
			};
		}
		throw new Error(attached.error.message);
	}
	const attachedRecord = record(attached.data);
	return {
		path,
		hash: generated.hash,
		mimeType: 'application/pdf',
		generatedAt:
			typeof attachedRecord.document_generated_at === 'string'
				? attachedRecord.document_generated_at
				: null,
		lockVersion:
			typeof attachedRecord.lock_version === 'number'
				? attachedRecord.lock_version
				: quote.lock_version + 1,
		bytes: storedBytes
	};
}

export async function quoteDocumentDownload(
	path: string,
	expectedHash: string
): Promise<Uint8Array> {
	return downloadByPath(path, expectedHash);
}

export { bytesToBase64 };
