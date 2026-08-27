import { describe, expect, it } from 'vitest';
import { pageTaskRows, taskQueueLimit } from './task-queue';

describe('task queue paging', () => {
	it('returns one page and an explicit continuation flag', () => {
		const rows = Array.from({ length: taskQueueLimit + 1 }, (_, index) => index);

		expect(pageTaskRows(rows)).toEqual({
			rows: rows.slice(0, taskQueueLimit),
			hasMore: true
		});
	});

	it('does not mark a complete page as truncated', () => {
		const rows = Array.from({ length: taskQueueLimit }, (_, index) => index);

		expect(pageTaskRows(rows)).toEqual({ rows, hasMore: false });
	});
});
