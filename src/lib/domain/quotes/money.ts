const QUANTITY_SCALE = 10_000n;
const TAX_RATE_SCALE = 10_000n;

export type QuoteMoneyLine = {
	quantity: string | number;
	unitPrice: string | number;
	taxable: boolean;
};

export type QuoteTotals = {
	lineSubtotals: string[];
	subtotal: string;
	taxAmount: string;
	total: string;
};

function scaledInteger(value: string | number, scale: bigint): bigint {
	const normalized = String(value).trim();
	if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
		throw new Error(`Invalid non-negative decimal: ${normalized}`);
	}
	const [whole, fraction = ''] = normalized.split('.');
	const scaleDigits = scale.toString().length - 1;
	if (fraction.length > scaleDigits) {
		throw new Error(`Decimal has too many fractional places: ${normalized}`);
	}
	return (
		BigInt(whole) * scale + BigInt((fraction + '0'.repeat(scaleDigits)).slice(0, scaleDigits) || 0)
	);
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
	return (numerator + denominator / 2n) / denominator;
}

function cents(value: bigint): string {
	const whole = value / 100n;
	const remainder = (value % 100n).toString().padStart(2, '0');
	return `${whole}.${remainder}`;
}

export function calculateQuoteTotals(
	lines: QuoteMoneyLine[],
	taxRate: string | number
): QuoteTotals {
	if (lines.length === 0) throw new Error('At least one quote line is required');
	const taxRateUnits = scaledInteger(taxRate, TAX_RATE_SCALE);
	const lineValues = lines.map((line) => {
		const quantity = scaledInteger(line.quantity, QUANTITY_SCALE);
		const unitPrice = scaledInteger(line.unitPrice, 100n);
		if (quantity <= 0n) throw new Error('Quantity must be greater than zero');
		const lineSubtotal = roundHalfUp(quantity * unitPrice, QUANTITY_SCALE);
		return { lineSubtotal, taxable: line.taxable };
	});
	const subtotalCents = lineValues.reduce((sum, line) => sum + line.lineSubtotal, 0n);
	const taxableCents = lineValues.reduce(
		(sum, line) => sum + (line.taxable ? line.lineSubtotal : 0n),
		0n
	);
	const taxAmountCents = roundHalfUp(taxableCents * taxRateUnits, 100n * TAX_RATE_SCALE);

	return {
		lineSubtotals: lineValues.map((line) => cents(line.lineSubtotal)),
		subtotal: cents(subtotalCents),
		taxAmount: cents(taxAmountCents),
		total: cents(subtotalCents + taxAmountCents)
	};
}
