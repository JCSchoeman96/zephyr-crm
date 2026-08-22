const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type DashboardDateRange = {
	from: string;
	to: string;
};

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10);
}

function validDate(value: string | null | undefined) {
	if (!value || !datePattern.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && dateOnly(parsed) === value;
}

function addDays(value: string, days: number) {
	const date = new Date(`${value}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return dateOnly(date);
}

export function normalizeDateRange(
	from: string | null | undefined,
	to: string | null | undefined,
	today = new Date()
): DashboardDateRange {
	const fallbackTo = dateOnly(today);
	const fallbackFrom = addDays(fallbackTo, -29);
	if (!validDate(from) || !validDate(to) || from! > to! || to! > fallbackTo) {
		return { from: fallbackFrom, to: fallbackTo };
	}
	const days = Math.round(
		(new Date(`${to}T00:00:00.000Z`).valueOf() - new Date(`${from}T00:00:00.000Z`).valueOf()) /
			86400000
	);
	if (days > 366) return { from: fallbackFrom, to: fallbackTo };
	return { from: from!, to: to! };
}

export function conversionRate(wonLeads: number, lostLeads: number) {
	const denominator = wonLeads + lostLeads;
	return denominator === 0 ? 0 : Math.round((wonLeads * 10000) / denominator) / 100;
}

export function money(value: number | string | null | undefined) {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
}

export function percent(value: number | string | null | undefined) {
	const numeric = Number(value ?? 0);
	return `${Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'}%`;
}
