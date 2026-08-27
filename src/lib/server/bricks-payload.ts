export type BricksPayload = Record<string, unknown>;

export type NormalizedBricksPayload = {
	rawMode: boolean;
	formId: string;
	externalId: string;
	payload: Record<string, string>;
	unknownFields: string[];
};

const canonicalFields = new Set([
	'form_id',
	'formId',
	'external_submission_id',
	'submission_id',
	'first_name',
	'last_name',
	'name',
	'email',
	'phone',
	'company',
	'message',
	'landing_page',
	'referrer',
	'referrer_url',
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_content',
	'utm_term',
	'source'
]);

const rawFieldNames = {
	'form-field-bkkmsp': 'external_submission_id',
	'form-field-dan_name': 'first_name',
	'form-field-dan_surname': 'last_name',
	'form-field-dan_email': 'email',
	'form-field-dan_phone': 'phone',
	'form-field-dan_message': 'message',
	'form-field-dan_town': 'town',
	'form-field-dan_product': 'product',
	'form-field-dan_product_type': 'product_type',
	'form-field-dan_area_type': 'area_type',
	'form-field-dan_width_mm': 'width_mm',
	'form-field-dan_height_mm': 'height_mm',
	'form-field-dan_openings_count': 'openings_count',
	'form-field-dan_installation[]': 'installation',
	'form-field-dan_timing[]': 'timing',
	'form-field-dan_contact_method[]': 'contact_method',
	'form-field-rcbtvz': 'affiliate_id',
	'form-field-ctlhqn': 'utm_source',
	'form-field-jrezxg': 'utm_medium',
	'form-field-pnqwvr': 'utm_campaign',
	'form-field-lcwxnh': 'utm_content',
	'form-field-amyrxq': 'landing_page',
	'form-field-hjpjbt': 'referral_date',
	'form-field-bigere': 'promo_code',
	'form-field-dan_photo': 'photo'
} as const;

const rawFields = new Set(Object.keys(rawFieldNames));
const allowedFields = new Set([...canonicalFields, ...rawFields]);

const qualificationFields = [
	['form-field-dan_town', 'Town/area'],
	['form-field-dan_product', 'Product'],
	['form-field-dan_product_type', 'Product type'],
	['form-field-dan_area_type', 'Area type'],
	['form-field-dan_width_mm', 'Width (mm)'],
	['form-field-dan_height_mm', 'Height (mm)'],
	['form-field-dan_openings_count', 'Openings'],
	['form-field-dan_installation[]', 'Installation'],
	['form-field-dan_timing[]', 'Timing'],
	['form-field-dan_contact_method[]', 'Contact method'],
	['form-field-rcbtvz', 'Affiliate ID'],
	['form-field-hjpjbt', 'Referral date'],
	['form-field-bigere', 'Promo code']
] as const;

function textValue(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
	if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ');
	return '';
}

function firstValue(payload: BricksPayload, ...keys: string[]): string {
	for (const key of keys) {
		const value = textValue(payload[key]);
		if (value) return value;
	}
	return '';
}

function qualificationMessage(payload: BricksPayload): string {
	const parts: string[] = [];
	const notes = firstValue(payload, 'message', 'form-field-dan_message');
	if (notes) parts.push(`Notes: ${notes}`);
	for (const [key, label] of qualificationFields) {
		const value = firstValue(payload, key);
		if (value) parts.push(`${label}: ${value}`);
	}
	return parts.join(' | ');
}

export function collectFormEncodedPayload(params: URLSearchParams): BricksPayload {
	const payload: BricksPayload = {};
	for (const [key, value] of params) {
		const previous = payload[key];
		if (previous === undefined) payload[key] = value;
		else if (Array.isArray(previous)) payload[key] = [...previous, value];
		else payload[key] = [previous, value];
	}
	return payload;
}

export function normalizeBricksPayload(
	rawPayload: BricksPayload,
	expectedFormId: string,
	headerFormId = ''
): NormalizedBricksPayload {
	const rawMode = Object.keys(rawPayload).some((key) => rawFields.has(key));
	const formId =
		firstValue(rawPayload, 'form_id', 'formId') || headerFormId || (rawMode ? expectedFormId : '');
	const externalId = firstValue(
		rawPayload,
		'external_submission_id',
		'submission_id',
		'form-field-bkkmsp'
	);
	const message = rawMode ? qualificationMessage(rawPayload) : firstValue(rawPayload, 'message');
	const payload = {
		first_name: firstValue(rawPayload, 'first_name', 'name', 'form-field-dan_name'),
		last_name: firstValue(rawPayload, 'last_name', 'form-field-dan_surname'),
		email: firstValue(rawPayload, 'email', 'form-field-dan_email'),
		phone: firstValue(rawPayload, 'phone', 'form-field-dan_phone'),
		company: firstValue(rawPayload, 'company'),
		message,
		landing_page: firstValue(rawPayload, 'landing_page', 'form-field-amyrxq'),
		referrer: firstValue(rawPayload, 'referrer', 'referrer_url'),
		utm_source: firstValue(rawPayload, 'utm_source', 'form-field-ctlhqn'),
		utm_medium: firstValue(rawPayload, 'utm_medium', 'form-field-jrezxg'),
		utm_campaign: firstValue(rawPayload, 'utm_campaign', 'form-field-pnqwvr'),
		utm_content: firstValue(rawPayload, 'utm_content', 'form-field-lcwxnh'),
		utm_term: firstValue(rawPayload, 'utm_term'),
		source: firstValue(rawPayload, 'source') || (rawMode ? 'bricks' : '')
	};
	return {
		rawMode,
		formId,
		externalId,
		payload,
		unknownFields: Object.keys(rawPayload).filter((key) => !allowedFields.has(key))
	};
}
