const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

type DateParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function formatter(timeZone: string, locale = 'en-GB') {
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		calendar: 'gregory',
		numberingSystem: 'latn',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	});
}

function partsAt(instant: Date, timeZone: string): DateParts {
	const values = Object.fromEntries(
		formatter(timeZone)
			.formatToParts(instant)
			.filter(({ type }) => type !== 'literal')
			.map(({ type, value }) => [type, Number(value)])
	);
	return {
		year: values.year,
		month: values.month,
		day: values.day,
		hour: values.hour,
		minute: values.minute,
		second: values.second
	};
}

function partsToMilliseconds(parts: DateParts) {
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function parseLocalDateTime(value: string): DateParts {
	const match = localDateTimePattern.exec(value.trim());
	if (!match) throw new Error('A scheduled time must use YYYY-MM-DDTHH:mm format');
	const parts = {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4]),
		minute: Number(match[5]),
		second: Number(match[6] ?? 0)
	};
	const milliseconds = partsToMilliseconds(parts);
	const normalized = new Date(milliseconds);
	if (
		normalized.getUTCFullYear() !== parts.year ||
		normalized.getUTCMonth() !== parts.month - 1 ||
		normalized.getUTCDate() !== parts.day ||
		normalized.getUTCHours() !== parts.hour ||
		normalized.getUTCMinutes() !== parts.minute ||
		normalized.getUTCSeconds() !== parts.second
	) {
		throw new Error('A scheduled time is not a valid calendar time');
	}
	return parts;
}

function parseIso(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error('A stored time is invalid');
	return date;
}

export function localDateTimeToIso(value: string, timeZone: string) {
	const wallTime = parseLocalDateTime(value);
	const wallMilliseconds = partsToMilliseconds(wallTime);
	let candidate = new Date(wallMilliseconds);

	// Iteratively apply the timezone offset. This handles ordinary offsets and
	// returns the earlier occurrence when a fall-back hour occurs twice.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const representedMilliseconds = partsToMilliseconds(partsAt(candidate, timeZone));
		const correction = wallMilliseconds - representedMilliseconds;
		if (correction === 0) return candidate.toISOString();
		candidate = new Date(candidate.getTime() + correction);
	}

	throw new Error(`The local time ${value} does not exist in ${timeZone}`);
}

export function utcIsoToLocalDateTime(value: string, timeZone: string) {
	const parts = partsAt(parseIso(value), timeZone);
	return (
		[
			`${parts.year}`.padStart(4, '0'),
			`${parts.month}`.padStart(2, '0'),
			`${parts.day}`.padStart(2, '0')
		].join('-') + `T${`${parts.hour}`.padStart(2, '0')}:${`${parts.minute}`.padStart(2, '0')}`
	);
}

export function utcIsoToLocalLabel(value: string, timeZone: string, locale: string) {
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(parseIso(value));
}
