/**
 * Normalize only numbers that already declare an international country code.
 * Display text remains stored separately; this value is a comparison/index aid.
 */
export function normalizePhone(value: string | null | undefined): string | null {
	const input = value?.trim() ?? '';
	if (!input.startsWith('+')) return null;
	const compact = input.replace(/[\s().-]/g, '');
	return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
